import {
  createChapterFromDraft,
  repairDraft,
  runDirectionAdvice,
  runReaderSimulation,
  startDraft,
} from '@/server/ai-features'
import { listEntries } from '@/server/wiki'
import { type ProofreadSuggestion, runChapterCheck, runProofread } from '@/server/chapter-check'
import { getChapter, listChapters, saveChapter, setChapterStatus } from '@/server/chapters'
import { listIssues, resolveIssue } from '@/server/issues'
import { listProposals } from '@/server/proposals'
import { chapterMetrics } from '../metrics'
import type { Answer, Pending } from '../author-io'
import type { RunContext, StepFn } from '../run'
import type { RunState } from '../state'
import {
  applyProposalDecisions,
  applySuggestions,
  chapterOf,
  consult,
  ExternalFailureError,
  guarded,
  isMarked,
  mark,
  pad,
  pendingFor,
  persist,
  pickAttempt,
  readRunFile,
  requireWorkId,
  selectDraftEntries,
  settle,
  toProposalItems,
  withModelRetry,
  writeRunFile,
} from './util'

// Per-chapter steps: direction advice, draft, proofread, chapter check, continuity, post-chapter
// proposals and reader simulation. A chapter whose draft failed has no chapter id, so its later
// steps do nothing.

function chapterSpec(ctx: RunContext, n: number) {
  const spec = ctx.bible.chapters[n - 1]
  if (!spec) throw new Error(`bible has no chapter ${n}`)
  return spec
}

/** The chapter already saved at manuscript position n, if an earlier run created it. */
async function chapterAt(ctx: RunContext, workId: string, n: number): Promise<string | null> {
  const rows = await listChapters(ctx.db, ctx.actor, workId)
  return rows.find((row) => row.position === n)?.id ?? null
}

export const advice: StepFn = async (ctx, key, state) => {
  if (isMarked(state, key)) return 'done'
  const n = chapterOf(key)
  const workId = requireWorkId(state)
  let note = pendingFor(ctx.dir, key, 'advice_note')
  if (!note) {
    const advised = await withModelRetry(ctx, state, key, () =>
      runDirectionAdvice(ctx.db, ctx.actor, { workId }, ctx.client),
    )
    if (!advised) return 'done'
    note = {
      kind: 'advice_note',
      step: key,
      chapter: n,
      result: advised.result,
      nextInstructions: chapterSpec(ctx, n).instructions,
    }
  }
  const answer = consult(ctx, note) as Extract<Answer, { kind: 'advice_note' }> | null
  if (!answer) {
    persist(ctx, state)
    return 'pending'
  }
  mark(ctx, state, key)
  settle(ctx, note, answer)
  return 'done'
}

/**
 * Runs a draft repair that must never fail the draft (spec 7). A model failure, or an error with no
 * failure recorded, keeps `fallback` (the unrepaired text) and lists the repair in `failed`, so the
 * report shows that it did not run. An external limit or network failure still pauses the run.
 */
export async function repairBestEffort(
  ctx: RunContext,
  state: RunState,
  label: string,
  repair: () => Promise<{ text: string }>,
  fallback: string,
): Promise<string> {
  try {
    return (await repair()).text
  } catch (error) {
    // Always take the recorded failure, so a swallowed one cannot be misread by a later call.
    const failure = ctx.client.takeLastFailure()
    if (failure && failure.kind !== 'model') throw new ExternalFailureError(failure)
    const message = failure?.message ?? (error instanceof Error ? error.message : String(error))
    state.failed.push({ step: label, message })
    persist(ctx, state)
    return fallback
  }
}

export const draft: StepFn = async (ctx, key, state) => {
  const n = chapterOf(key)
  const created = `ch${n}:chapter-created`
  if (isMarked(state, created)) return 'done'
  const spec = chapterSpec(ctx, n)
  const workId = requireWorkId(state)

  // The chapter was saved before its mark was: adopt it, never draft it again.
  const existing = await chapterAt(ctx, workId, n)
  if (existing) {
    state.data.chapterIds[n] = existing
    mark(ctx, state, created)
    return 'done'
  }

  const attempts = (state.data.drafts[n] ??= [])
  const maxAttempts = ctx.config.maxDraftAttempts

  for (;;) {
    const last = attempts.at(-1)
    // A verdict that ends the attempts is final: a rerun never drafts again for it.
    if (last && last.usable !== null && (last.usable || attempts.length >= maxAttempts)) break

    let current = last
    if (!current || current.usable !== null) {
      const attemptNo = attempts.length + 1
      const entries = await listEntries(ctx.db, ctx.actor, workId)
      const entryIds = selectDraftEntries(
        entries.map((entry) => ({ id: entry.id, name: entry.name, aliases: entry.aliases })),
        spec.instructions,
      )
      const generated = await withModelRetry(ctx, state, key, async () => {
        const run = await startDraft(
          ctx.db,
          ctx.actor,
          {
            workId,
            instructions: spec.instructions,
            targetChars: ctx.bible.targetChars,
            entryIds,
          },
          ctx.client,
        )
        return { runId: run.runId, text: await run.done }
      })
      if (!generated) {
        // A failed attempt is already in `failed`. With an earlier attempt that has text, the best
        // attempt so far is saved below; with none, the chapter is skipped.
        if (attempts.length === 0) {
          state.failed.push({ step: key, message: 'no draft text' })
          persist(ctx, state)
          return 'done'
        }
        break
      }
      // E2: one repair on the final text (after A's continuation). Best effort, see repairBestEffort.
      const repairedText = await repairBestEffort(
        ctx,
        state,
        `${key}:repair`,
        () =>
          repairDraft(
            ctx.db,
            ctx.actor,
            { workId, runId: generated.runId, lang: ctx.config.lang },
            ctx.client,
          ),
        generated.text,
      )
      if (repairedText !== generated.text) {
        writeRunFile(ctx.dir, `chapters/${pad(n)}.attempt-${attemptNo}.repaired.txt`, repairedText)
      }
      writeRunFile(ctx.dir, `chapters/${pad(n)}.attempt-${attemptNo}.md`, repairedText)
      attempts.push({ runId: generated.runId, usable: null, quality: null, reason: '' })
      persist(ctx, state)
      current = attempts.at(-1)
    }
    const attemptNo = attempts.length
    const textFile = `chapters/${pad(n)}.attempt-${attemptNo}.md`
    const text = readRunFile(ctx.dir, textFile)
    const review: Pending = {
      kind: 'draft_review',
      step: key,
      chapter: n,
      attempt: attemptNo,
      maxAttempts,
      instructions: spec.instructions,
      mustInclude: spec.mustInclude,
      textFile,
      metrics: chapterMetrics(text, ctx.config.lang, ctx.bible.targetChars, [
        ctx.bible.workStyle.examples,
      ]),
    }
    const verdict = consult(ctx, review) as Extract<Answer, { kind: 'draft_review' }> | null
    if (!verdict) {
      persist(ctx, state)
      return 'pending'
    }
    if (current) {
      current.usable = verdict.usable
      current.quality = verdict.quality
      current.reason = verdict.reason
    }
    persist(ctx, state)
    settle(ctx, review, verdict)
    if (verdict.usable || attempts.length >= maxAttempts) break
  }

  const chosen = pickAttempt(attempts)
  const chapter = await guarded(ctx, state, key, () =>
    createChapterFromDraft(ctx.db, ctx.actor, {
      workId,
      runId: chosen.runId,
      title: spec.title,
    }),
  )
  if (chapter) state.data.chapterIds[n] = chapter.id
  mark(ctx, state, created)
  return 'done'
}

export const proofread: StepFn = async (ctx, key, state) => {
  const n = chapterOf(key)
  const chapterId = state.data.chapterIds[n]
  if (!chapterId) return 'done'
  const beforeFile = `chapters/${pad(n)}.draft.md`
  const afterFile = `chapters/${pad(n)}.md`
  const suggestionsFile = `chapters/${pad(n)}.proofread.json`
  const savedMark = `${key}:saved`
  const statusMark = `${key}:status`

  if (!isMarked(state, savedMark)) {
    let review = pendingFor(ctx.dir, key, 'proofread')
    if (!review) {
      const chapter = await getChapter(ctx.db, ctx.actor, chapterId)
      const proofed = await guarded(ctx, state, key, () =>
        runProofread(ctx.db, ctx.actor, { chapterId, useAi: true }, ctx.client),
      )
      if (proofed) {
        writeRunFile(ctx.dir, beforeFile, chapter.body)
        writeRunFile(ctx.dir, suggestionsFile, JSON.stringify(proofed.suggestions, null, 2))
        review = {
          kind: 'proofread',
          step: key,
          chapter: n,
          textFile: beforeFile,
          items: proofed.suggestions.map((s, i) => ({
            id: String(i),
            quote: s.quote,
            replacement: s.replacement,
            kind: s.kind,
            reason: s.reason,
            source: s.source,
          })),
        }
      } else {
        // Proofreading failed and is recorded in `failed`: the chapter keeps its body.
        writeRunFile(ctx.dir, beforeFile, chapter.body)
        writeRunFile(ctx.dir, suggestionsFile, '[]\n')
        writeRunFile(ctx.dir, afterFile, chapter.body)
        mark(ctx, state, savedMark)
      }
    }
    if (review && !isMarked(state, savedMark)) {
      const answer = consult(ctx, review) as Extract<Answer, { kind: 'proofread' }> | null
      if (!answer) {
        persist(ctx, state)
        return 'pending'
      }
      const suggestions = JSON.parse(readRunFile(ctx.dir, suggestionsFile)) as ProofreadSuggestion[]
      const accepted = answer.decisions
        .filter((d) => d.accept)
        .map((d) => suggestions[Number(d.id)])
        .filter((s): s is ProofreadSuggestion => s !== undefined)
      const after = applySuggestions(readRunFile(ctx.dir, beforeFile), accepted)
      const current = await getChapter(ctx.db, ctx.actor, chapterId)
      if (after !== current.body) {
        await saveChapter(ctx.db, ctx.actor, {
          chapterId,
          body: after,
          expectedVersion: current.version,
        })
      }
      writeRunFile(ctx.dir, afterFile, after)
      mark(ctx, state, savedMark)
      settle(ctx, review, answer)
    }
  }

  if (!isMarked(state, statusMark)) {
    await setChapterStatus(ctx.db, ctx.actor, chapterId, 'done')
    mark(ctx, state, statusMark)
  }
  const finalText = readRunFile(ctx.dir, afterFile)
  writeRunFile(
    ctx.dir,
    `metrics/${pad(n)}.json`,
    `${JSON.stringify(
      chapterMetrics(finalText, ctx.config.lang, ctx.bible.targetChars, [
        ctx.bible.workStyle.examples,
      ]),
      null,
      2,
    )}\n`,
  )
  return 'done'
}

export const check: StepFn = async (ctx, key, state) => {
  const n = chapterOf(key)
  const chapterId = state.data.chapterIds[n]
  if (!chapterId || isMarked(state, key)) return 'done'
  const checked = await withModelRetry(ctx, state, key, () =>
    runChapterCheck(ctx.db, ctx.actor, { chapterId }, ctx.client),
  )
  if (checked) {
    state.data.checkProposalIds = {
      ...state.data.checkProposalIds,
      [n]: checked.proposals.map((row) => row.id),
    }
    mark(ctx, state, key)
  }
  return 'done'
}

export const continuity: StepFn = async (ctx, key, state) => {
  const n = chapterOf(key)
  const chapterId = state.data.chapterIds[n]
  if (!chapterId || isMarked(state, key)) return 'done'
  const open = await listIssues(ctx.db, ctx.actor, chapterId, { statuses: ['open'] })
  if (open.length === 0) {
    mark(ctx, state, key)
    return 'done'
  }
  const openIds = new Set(open.map((issue) => issue.id))
  const review: Extract<Pending, { kind: 'continuity' }> = pendingFor(
    ctx.dir,
    key,
    'continuity',
  ) ?? {
    kind: 'continuity',
    step: key,
    chapter: n,
    textFile: `chapters/${pad(n)}.md`,
    items: open.map((issue) => ({
      id: issue.id,
      kind: issue.kind,
      severity: issue.severity,
      quote: issue.quote,
      explanation: issue.explanation,
      suggestion: issue.suggestion,
    })),
  }
  const answer = consult(ctx, review) as Extract<Answer, { kind: 'continuity' }> | null
  if (!answer) {
    persist(ctx, state)
    return 'pending'
  }
  for (const decision of answer.decisions) {
    // An issue already resolved on an earlier attempt is no longer open.
    if (!openIds.has(decision.id)) continue
    await resolveIssue(ctx.db, ctx.actor, {
      issueId: decision.id,
      status: decision.valid ? 'accepted' : 'dismissed',
    })
  }
  mark(ctx, state, key)
  settle(ctx, review, answer)
  return 'done'
}

export const proposals: StepFn = async (ctx, key, state) => {
  const n = chapterOf(key)
  const chapterId = state.data.chapterIds[n]
  if (!chapterId || isMarked(state, key)) return 'done'
  const workId = requireWorkId(state)
  let decision: Pending | null = pendingFor(ctx.dir, key, 'proposals')
  if (!decision) {
    const ids = state.data.checkProposalIds?.[n] ?? []
    const views = (await listProposals(ctx.db, ctx.actor, workId, { chapterId })).filter((view) =>
      ids.includes(view.id),
    )
    if (views.length === 0) {
      mark(ctx, state, key)
      return 'done'
    }
    decision = {
      kind: 'proposals',
      step: key,
      source: 'post_chapter',
      chapter: n,
      chapterFile: `chapters/${pad(n)}.md`,
      items: toProposalItems(views),
    }
  }
  const answer = consult(ctx, decision) as Extract<Answer, { kind: 'proposals' }> | null
  if (!answer) {
    persist(ctx, state)
    return 'pending'
  }
  await applyProposalDecisions(ctx, state, key, answer.decisions)
  mark(ctx, state, key)
  settle(ctx, decision, answer)
  return 'done'
}

export const reader: StepFn = async (ctx, key, state) => {
  const n = chapterOf(key)
  const chapterId = state.data.chapterIds[n]
  if (!chapterId || isMarked(state, key)) return 'done'
  const simulated = await guarded(ctx, state, key, () =>
    runReaderSimulation(ctx.db, ctx.actor, { chapterId }, ctx.client),
  )
  if (simulated) {
    writeRunFile(ctx.dir, `reader/${pad(n)}.json`, `${JSON.stringify(simulated.result, null, 2)}\n`)
    mark(ctx, state, key)
  }
  return 'done'
}
