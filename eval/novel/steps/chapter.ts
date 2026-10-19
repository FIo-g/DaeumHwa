import { copyFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  createChapterFromDraft,
  repairDraft,
  runDirectionAdvice,
  runReaderSimulation,
  startDraft,
} from '@/server/ai-features'
import { aiRuns } from '@/db/schema'
import { replaceRunOutput } from '@/ai/run'
import { trimOverlongParagraphs } from '@/server/draft-paragraphs'
import { listEntries } from '@/server/wiki'
import {
  hasOverlongSpan,
  overlongParagraphs,
  PARAGRAPH_MAX_SENTENCES,
} from '@/lib/korean/paragraphs'
import { type ProofreadSuggestion, runChapterCheck, runProofread } from '@/server/chapter-check'
import { getChapter, listChapters, saveChapter, setChapterStatus } from '@/server/chapters'
import { listIssues, resolveIssue } from '@/server/issues'
import { rewriteFlaggedScenes } from '@/server/scene-rewrite'
import { listProposals } from '@/server/proposals'
import { classifyError, type FailureKind } from '../eval-client'
import { bibleExempt, chapterMetrics } from '../metrics'
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
  pickRewriteIssueIds,
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

const ContinueWarningSchema = z.object({
  kind: z.literal('continue-failed'),
  reason: z.string(),
  detail: z.string(),
})

/**
 * The continuation failure in a draft run row (A's warning, spec 7), or null. Other warning kinds
 * are skipped. `reason` is an AppError code, 'UNKNOWN' or 'EMPTY'.
 */
export function continueFailureOf(output: unknown): { reason: string; detail: string } | null {
  const row = z.object({ warnings: z.array(z.unknown()) }).safeParse(output)
  if (!row.success) return null
  for (const warning of row.data.warnings) {
    const parsed = ContinueWarningSchema.safeParse(warning)
    if (parsed.success) return { reason: parsed.data.reason, detail: parsed.data.detail }
  }
  return null
}

/**
 * Records a continuation that failed, from the first run row. The draft keeps its first text, so
 * the attempt is not lost; the failure the client still holds for it is taken, so no later step
 * reads it as its own. An external limit or network failure pauses the run like any other external
 * failure (withModelRetry). Writes the attempt's continue.json, which the run summary counts.
 */
export async function recordContinueFailure(
  ctx: RunContext,
  runId: string,
  n: number,
  attemptNo: number,
): Promise<void> {
  const [run] = await ctx.db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
  const failed = continueFailureOf(run?.output)
  if (!failed) return
  // The client's own classification of the failed call (it saw the error itself, with its status,
  // cause codes and stream tag). Only when it holds none, the stored detail is judged by its text.
  const held = ctx.client.takeLastFailure()
  const failure: FailureKind =
    failed.reason === 'AI_LIMIT'
      ? 'external-limit'
      : (held?.kind ?? classifyError(new Error(failed.detail)))
  writeRunFile(
    ctx.dir,
    `chapters/${pad(n)}.attempt-${attemptNo}.continue.json`,
    `${JSON.stringify(
      {
        kind: 'continue-failed',
        message: '이어쓰기 실패',
        reason: failed.reason,
        detail: failed.detail,
        failure,
      },
      null,
      2,
    )}\n`,
  )
  if (failure !== 'model') throw new ExternalFailureError({ kind: failure, message: failed.detail })
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

/**
 * E1: trims the paragraphs that run over the sentence limit (spec 7). Runs on the draft text after
 * the continuation and before the repair. Returns the text the next stage starts from. A trim that
 * breaks the length check, fails, or changes nothing keeps the raw text. A draft with offenders
 * always gets a trim.json; a draft without offenders makes no call and writes nothing.
 */
async function trimStage(
  ctx: RunContext,
  state: RunState,
  key: string,
  workId: string,
  text: string,
  attemptNo: number,
  runId: string,
): Promise<string> {
  const n = chapterOf(key)
  const preOffenders = overlongParagraphs(text)
  if (preOffenders.length === 0) return text

  const trimmed = await withModelRetry(ctx, state, `${key}:paragraphs`, () =>
    trimOverlongParagraphs(ctx.db, ctx.actor, { workId, text }, ctx.client),
  )
  // A round-2 failure is swallowed by the service, which keeps the round-1 fixes. Its failure record
  // must not reach a later call, so it is discarded here.
  ctx.client.takeLastFailure()

  const lengthOk = (value: string) =>
    chapterMetrics(value, ctx.config.lang, ctx.bible.targetChars).lengthOk
  const lengthRejected =
    trimmed !== null && trimmed.changed && lengthOk(text) && !lengthOk(trimmed.text)
  const useTrimmed = trimmed !== null && trimmed.changed && !lengthRejected

  let status: 'ok' | 'unchanged' | 'guarded' | 'failed'
  if (trimmed === null) status = 'failed'
  else if (!trimmed.changed) status = 'unchanged'
  else if (lengthRejected) status = 'guarded'
  else status = 'ok'
  // A quoted span over the limit can never pass isValidTrim, so these are reported apart.
  const unfixableDialogue = preOffenders.filter((p) =>
    hasOverlongSpan(p.text, PARAGRAPH_MAX_SENTENCES),
  ).length
  const record = {
    status,
    before: preOffenders.length,
    after: useTrimmed && trimmed ? trimmed.after : preOffenders.length,
    rounds: trimmed?.rounds ?? 0,
    runIds: trimmed?.runIds ?? [],
    unfixableDialogue,
  }
  writeRunFile(
    ctx.dir,
    `chapters/${pad(n)}.attempt-${attemptNo}.trim.json`,
    `${JSON.stringify(record, null, 2)}\n`,
  )

  if (trimmed === null || !useTrimmed) return text
  writeRunFile(ctx.dir, `chapters/${pad(n)}.attempt-${attemptNo}.draft.trimmed.txt`, trimmed.text)
  // The run record holds the trimmed text too, so a repair that fails still leaves it in place.
  // The other output fields (continuation warnings) are kept.
  const [run] = await ctx.db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
  const output =
    typeof run?.output === 'object' && run.output !== null ? (run.output as object) : {}
  await replaceRunOutput(ctx.db, runId, { ...output, text: trimmed.text })
  return trimmed.text
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
            // Local eval only (brief D): the scene beat list is made first and goes into the prose.
            twoStep: true,
          },
          ctx.client,
        )
        return { runId: run.runId, text: await run.done, beats: run.beats }
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
      // A resumed draft gets the same attempt number as the abandoned one, so the stage files of
      // the abandoned draft go first, and the raw text (A's output) is written for every draft.
      const stem = `chapters/${pad(n)}.attempt-${attemptNo}`
      for (const stale of [
        'beats.json',
        'continue.json',
        'trim.json',
        'draft.trimmed.txt',
        'draft.repaired.txt',
      ]) {
        rmSync(path.join(ctx.dir, `${stem}.${stale}`), { force: true })
      }
      writeRunFile(ctx.dir, `${stem}.draft.raw.txt`, generated.text)
      if (generated.beats) {
        writeRunFile(ctx.dir, `${stem}.beats.json`, JSON.stringify(generated.beats, null, 2))
      }
      // Taken before the trim stage, whose own takeLastFailure would discard it.
      await recordContinueFailure(ctx, generated.runId, n, attemptNo)
      // E1 then E2, each stage on the text the previous one returned (spec 7).
      const trimmedText = await trimStage(
        ctx,
        state,
        key,
        workId,
        generated.text,
        attemptNo,
        generated.runId,
      )
      // E2: one repair on the final text (after A's continuation). Best effort, see repairBestEffort.
      // It starts from the trimmed text, which is also what repairDraft stores when it runs.
      const repairedText = await repairBestEffort(
        ctx,
        state,
        `${key}:repair`,
        () =>
          repairDraft(
            ctx.db,
            ctx.actor,
            { workId, runId: generated.runId, lang: ctx.config.lang, text: trimmedText },
            ctx.client,
          ),
        trimmedText,
      )
      if (repairedText !== trimmedText) {
        writeRunFile(ctx.dir, `${stem}.draft.repaired.txt`, repairedText)
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
      metrics: chapterMetrics(
        text,
        ctx.config.lang,
        ctx.bible.targetChars,
        [ctx.bible.workStyle.examples],
        bibleExempt(ctx.bible),
      ),
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
  // The saved chapter is the attempt file the author reviewed, not the run's stored text.
  const chosenFile = `chapters/${pad(n)}.attempt-${attempts.indexOf(chosen) + 1}.md`
  const chapter = await guarded(ctx, state, key, () =>
    createChapterFromDraft(ctx.db, ctx.actor, {
      workId,
      runId: chosen.runId,
      title: spec.title,
      body: readRunFile(ctx.dir, chosenFile),
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
      chapterMetrics(
        finalText,
        ctx.config.lang,
        ctx.bible.targetChars,
        [ctx.bible.workStyle.examples],
        bibleExempt(ctx.bible),
      ),
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
    if (checked.extraction) {
      writeRunFile(
        ctx.dir,
        `chapters/${pad(n)}.extraction.json`,
        `${JSON.stringify(checked.extraction)}\n`,
      )
    }
    state.data.checkProposalIds = {
      ...state.data.checkProposalIds,
      [n]: checked.proposals.map((row) => row.id),
    }
    mark(ctx, state, key)
  }
  return 'done'
}

/**
 * Scene rewrite for one chapter (brief D, local eval). The service saves the body before the files
 * are written, so whenever the pre-rewrite copy exists the chapter and metrics files are rewritten
 * from the saved body. Every write is idempotent. A content error is recorded by guarded, and the
 * rewrite is not retried on resume.
 */
async function rewriteStage(
  ctx: RunContext,
  state: RunState,
  key: string,
  n: number,
  chapterId: string,
  ids: string[],
): Promise<void> {
  const preFile = `chapters/${pad(n)}.pre-rewrite.md`
  const rewritesFile = `rewrites/${pad(n)}.json`
  let result: Awaited<ReturnType<typeof rewriteFlaggedScenes>> | null = null
  if (ids.length > 0) {
    // The copies are taken before the service call, and only once: a resumed call keeps them.
    if (!existsSync(path.join(ctx.dir, preFile))) {
      const before = (await getChapter(ctx.db, ctx.actor, chapterId)).body
      writeRunFile(ctx.dir, preFile, before)
    }
    const metricsFile = `metrics/${pad(n)}.json`
    const preMetrics = `metrics/${pad(n)}.pre-rewrite.json`
    if (
      existsSync(path.join(ctx.dir, metricsFile)) &&
      !existsSync(path.join(ctx.dir, preMetrics))
    ) {
      copyFileSync(path.join(ctx.dir, metricsFile), path.join(ctx.dir, preMetrics))
    }
    const outcome = await guarded(ctx, state, key, () =>
      rewriteFlaggedScenes(ctx.db, ctx.actor, { chapterId, issueIds: ids }, ctx.client),
    )
    // A content error is already in `failed`: no rewrite files are written.
    if (outcome === null) return
    result = outcome
  }
  if (!existsSync(path.join(ctx.dir, preFile))) return

  const body = (await getChapter(ctx.db, ctx.actor, chapterId)).body
  writeRunFile(ctx.dir, `chapters/${pad(n)}.md`, body)
  writeRunFile(
    ctx.dir,
    `metrics/${pad(n)}.json`,
    `${JSON.stringify(
      chapterMetrics(
        body,
        ctx.config.lang,
        ctx.bible.targetChars,
        [ctx.bible.workStyle.examples],
        bibleExempt(ctx.bible),
      ),
      null,
      2,
    )}\n`,
  )
  // A resumed call finds the scene already rewritten and records nothing, so it must not replace
  // the record of the first call.
  if (result && (result.rewritten.length > 0 || !existsSync(path.join(ctx.dir, rewritesFile)))) {
    writeRunFile(
      ctx.dir,
      rewritesFile,
      `${JSON.stringify({ rewritten: result.rewritten, skipped: result.skipped }, null, 2)}\n`,
    )
  }
}

export const continuity: StepFn = async (ctx, key, state) => {
  const n = chapterOf(key)
  const chapterId = state.data.chapterIds[n]
  if (!chapterId || isMarked(state, key)) return 'done'
  const open = await listIssues(ctx.db, ctx.actor, chapterId, { statuses: ['open'] })
  // A pending review stays until settle, so a rerun after a crash still reaches the rewrite stage.
  if (open.length === 0 && !pendingFor(ctx.dir, key, 'continuity')) {
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
  // After the resolve loop, since the service rewrites only accepted issues. An issue accepted on
  // an earlier attempt stays eligible; a dismissed one is never picked.
  const rewrittenKey = `${key}:rewritten`
  if (!isMarked(state, rewrittenKey)) {
    const ids = pickRewriteIssueIds(review.items, answer.decisions)
    await rewriteStage(ctx, state, key, n, chapterId, ids)
    mark(ctx, state, rewrittenKey)
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
