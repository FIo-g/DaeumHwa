import { copyFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  createChapterFromDraft,
  planDraft,
  repairDraft,
  repairDraftForeignScript,
  runDirectionAdvice,
  runReaderSimulation,
  startDraft,
} from '@/server/ai-features'
import { type DraftPlanCard, renderPlanInstructions } from '@/lib/draft-plan'
import { aiRuns } from '@/db/schema'
import { replaceRunOutput } from '@/ai/run'
import { repairableForeignSpans } from '@/ai/tasks/draft-repair'
import { DraftBeatsSchema, renderBeatLocations } from '@/ai/tasks/draft-beats'
import { MODEL_PROFILES, twoStepEnabled } from '../models'
import { chapterInstructions } from '../instructions'
import { plantLedger } from '../directives'
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
import { applySceneFix, checkAndFixDraft } from '@/server/draft-check'
import { classifyError, type FailureKind } from '../eval-client'
import { bibleExempt, chapterMetrics, planTargetsOf } from '../metrics'
import type { Answer, Pending } from '../author-io'
import type { RunContext, StepFn } from '../run'
import type { DraftAttempt, RunState } from '../state'
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
      nextInstructions: chapterInstructions(ctx.bible, n, ctx.config),
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
 * Every continuation failure in a draft run row (A's warning, spec 7 and stage 1b's per-span
 * warnings), in order. Other warning kinds are skipped. `reason` is an AppError code, 'UNKNOWN',
 * 'EMPTY', 'COMMENTARY' or an expansion code; `detail` is text (story text for the refusals).
 */
export function continueFailuresOf(output: unknown): { reason: string; detail: string }[] {
  const row = z.object({ warnings: z.array(z.unknown()) }).safeParse(output)
  if (!row.success) return []
  const found: { reason: string; detail: string }[] = []
  for (const warning of row.data.warnings) {
    const parsed = ContinueWarningSchema.safeParse(warning)
    if (parsed.success) found.push({ reason: parsed.data.reason, detail: parsed.data.detail })
  }
  return found
}

/** The first continuation failure in a draft run row, or null. */
export function continueFailureOf(output: unknown): { reason: string; detail: string } | null {
  return continueFailuresOf(output)[0] ?? null
}

/** Reasons whose detail is model text: a refused rewrite made no failed call, so it is a model failure. */
const TEXT_REASONS = new Set(['EXPAND_REJECTED', 'COMMENTARY', 'EMPTY'])

const SEVERITY: Record<FailureKind, number> = {
  model: 0,
  'external-network': 1,
  'external-limit': 2,
}

/**
 * The kind of one recorded failure. A refusal of model text is 'model' and its text is never
 * classified. An expansion's own error uses the client's held failure, or its AppError code in
 * detail; other continuation codes use the held failure, or their detail's text.
 */
function failureKindOf(
  failure: { reason: string; detail: string },
  held: { kind: FailureKind } | null,
): FailureKind {
  if (
    failure.reason === 'AI_LIMIT' ||
    (failure.reason === 'EXPAND_ERROR' && failure.detail === 'AI_LIMIT')
  ) {
    return 'external-limit'
  }
  if (TEXT_REASONS.has(failure.reason)) return 'model'
  return held?.kind ?? classifyError(new Error(failure.detail))
}

/**
 * Records every continuation failure of a draft attempt, from its run row. The draft keeps its
 * first text, so the attempt is not lost; the failure the client still holds for it is taken, so
 * no later step reads it as its own. An external limit or network failure pauses the run like any
 * other external failure (withModelRetry), with the held failure's message or the reason, never
 * the story text. Writes the attempt's continue.json, which the run summary counts per entry.
 */
export async function recordContinueFailure(
  ctx: RunContext,
  runId: string,
  n: number,
  attemptNo: number,
): Promise<void> {
  const [run] = await ctx.db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
  const found = continueFailuresOf(run?.output)
  if (found.length === 0) return
  // The client's own classification of the failed call (it saw the error itself, with its status,
  // cause codes and stream tag). Only when it holds none, the stored detail is judged by its text.
  const held = ctx.client.takeLastFailure()
  const failures = found.map((item) => ({
    reason: item.reason,
    detail: item.detail,
    failure: failureKindOf(item, held),
  }))
  const worst = [...failures.map((item) => item.failure), ...(held ? [held.kind] : [])].reduce(
    (a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a),
  )
  writeRunFile(
    ctx.dir,
    `chapters/${pad(n)}.attempt-${attemptNo}.continue.json`,
    `${JSON.stringify(
      {
        kind: 'continue-failed',
        message: '이어쓰기 실패',
        reason: failures[0]?.reason,
        detail: failures[0]?.detail,
        failure: worst,
        failures,
      },
      null,
      2,
    )}\n`,
  )
  if (worst === 'model') return
  if (held?.kind === worst) throw new ExternalFailureError(held)
  const message = failures.find((item) => item.failure === worst)?.reason ?? worst
  throw new ExternalFailureError({ kind: worst, message })
}

const ScenesCutWarningSchema = z.object({
  code: z.literal('SCENES_CUT'),
  scenesWritten: z.number().int().nonnegative(),
})

/**
 * The scenes-mode cut in a draft run row (the SCENES_CUT warning of completeScenes), or null. Other
 * warning kinds are skipped, as continueFailureOf skips this one.
 */
export function scenesCutOf(output: unknown): { scenesWritten: number } | null {
  const row = z.object({ warnings: z.array(z.unknown()) }).safeParse(output)
  if (!row.success) return null
  for (const warning of row.data.warnings) {
    const parsed = ScenesCutWarningSchema.safeParse(warning)
    if (parsed.success) return { scenesWritten: parsed.data.scenesWritten }
  }
  return null
}

/**
 * Records a scenes-mode draft that stopped before its last planned scene, from the first run row.
 * The draft keeps the scenes it has, so the failure of the scene call that ended it is still held by
 * the client: it is always taken, so no later step reads it as its own. An external limit or network
 * failure pauses the run like a continuation failure does, so the draft is redone instead of being
 * measured short. A model failure, or a cut with no failed call (time budget, empty scene), is only
 * recorded. Writes the attempt's scenes-cut.json, which the run summary counts.
 */
export async function recordScenesCut(
  ctx: RunContext,
  runId: string,
  n: number,
  attemptNo: number,
  planned: number,
): Promise<void> {
  const [run] = await ctx.db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
  const cut = scenesCutOf(run?.output)
  if (!cut) return
  const held = ctx.client.takeLastFailure()
  writeRunFile(
    ctx.dir,
    `chapters/${pad(n)}.attempt-${attemptNo}.scenes-cut.json`,
    `${JSON.stringify(
      {
        kind: 'scenes-cut',
        scenesWritten: cut.scenesWritten,
        planned,
        failure: held?.kind ?? 'budget',
        message: held?.message ?? null,
      },
      null,
      2,
    )}\n`,
  )
  if (held && held.kind !== 'model') throw new ExternalFailureError(held)
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
 * Stage 3: checks the stored draft and applies the fix (the product's one-click default), right
 * after the draft (and continuation) is stored and before trim and repair. The author sees the
 * final text in draft_review. A failed check call keeps the code findings with a notice; the
 * failed call stays in the call records and the draft goes on unchanged.
 */
async function checkFixStage(
  ctx: RunContext,
  state: RunState,
  key: string,
  workId: string,
  runId: string,
  text: string,
): Promise<string> {
  if (ctx.config.sceneFix === false) return text
  try {
    const result = await checkAndFixDraft(ctx.db, ctx.actor, { workId, runId }, ctx.client)
    // The service swallows AI failures into a notice; the failed call stays in the call records.
    // Drain the recorded failure so a later call never reads it as its own.
    ctx.client.takeLastFailure()
    if (!result.fix) return text
    try {
      const applied = await applySceneFix(ctx.db, ctx.actor, {
        workId,
        runId,
        token: result.fix.token,
      })
      return applied.text
    } catch (error) {
      ctx.client.takeLastFailure()
      const message = error instanceof Error ? error.message : String(error)
      state.failed.push({ step: `${key}:scene-fix`, message })
      persist(ctx, state)
      return text
    }
  } catch (error) {
    const failure = ctx.client.takeLastFailure()
    if (failure && failure.kind !== 'model') throw new ExternalFailureError(failure)
    const message = failure?.message ?? (error instanceof Error ? error.message : String(error))
    state.failed.push({ step: `${key}:check`, message })
    persist(ctx, state)
    return text
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

/** Few-instruction runs: the author's notes on a plan card before the card is final. */
const MAX_PLAN_NOTES = 3

/** Plans the chapter card once. Null when the planner gave no usable card (its failure is recorded). */
async function planCard(
  ctx: RunContext,
  state: RunState,
  key: string,
  workId: string,
  instructions: string,
  revision?: { card: DraftPlanCard; note: string; earlierNotes?: string[] },
): Promise<{ runId: string; card: DraftPlanCard } | null> {
  const entries = await listEntries(ctx.db, ctx.actor, workId)
  const entryIds = selectDraftEntries(
    entries.map((entry) => ({ id: entry.id, name: entry.name, aliases: entry.aliases })),
    instructions,
  )
  return withModelRetry(ctx, state, key, async () => {
    const planned = await planDraft(
      ctx.db,
      ctx.actor,
      {
        workId,
        instructions,
        targetChars: ctx.bible.targetChars,
        entryIds,
        ...(revision ? { revision } : {}),
      },
      ctx.client,
    )
    return { runId: planned.runId, card: planned.card }
  })
}

/**
 * The approved plan card of chapter n (stage 1). Null for a quick run. Planned once per chapter and
 * kept in state, so a resumed worker continues from it. A few-instruction run posts a plan_review:
 * each note re-plans the card, and after MAX_PLAN_NOTES notes the last card is used. A note whose
 * re-plan fails keeps the card it had. 'pending' while the author has not answered; 'failed' when
 * no card could be planned.
 */
async function approvedPlan(
  ctx: RunContext,
  state: RunState,
  key: string,
  n: number,
  workId: string,
  instructions: string,
): Promise<NonNullable<RunState['data']['plans']>[number] | 'pending' | 'failed' | null> {
  if (ctx.config.quick) return null
  const plans = (state.data.plans ??= {})
  let entry = plans[n]
  if (!entry) {
    const planned = await planCard(ctx, state, key, workId, instructions)
    if (!planned) return 'failed'
    entry = { runId: planned.runId, card: planned.card, notes: [] }
    plans[n] = entry
    persist(ctx, state)
  }
  // The approval is marked, so a later entry into the draft step does not ask the author again.
  const approvedMark = `ch${n}:plan-approved`
  if (!ctx.config.fewInstructions || isMarked(state, approvedMark)) return entry

  for (;;) {
    if (entry.notes.length >= MAX_PLAN_NOTES) break
    const review: Pending = {
      kind: 'plan_review',
      step: key,
      chapter: n,
      card: renderPlanInstructions('', entry.card),
      intention: chapterSpec(ctx, n).instructions,
      // Few-instruction runs never list mustInclude (see the draft review below).
      mustInclude: [],
      round: entry.notes.length + 1,
    }
    const verdict = consult(ctx, review) as Extract<Answer, { kind: 'plan_review' }> | null
    if (!verdict) {
      persist(ctx, state)
      return 'pending'
    }
    if (verdict.approve) {
      settle(ctx, review, verdict)
      break
    }

    // The re-plan runs before the note counts. A pause during it leaves the review pending with its
    // answer, so the resumed worker repeats the re-plan with the same note. Every revision call
    // carries the notes the author gave before it for this chapter.
    const note = verdict.note ?? ''
    const replanned = await planCard(ctx, state, key, workId, instructions, {
      card: entry.card,
      note,
      earlierNotes: [...entry.notes],
    })
    entry.notes.push(note)
    if (replanned) {
      entry.runId = replanned.runId
      entry.card = replanned.card
    }
    persist(ctx, state)
    settle(ctx, review, verdict)
  }
  mark(ctx, state, approvedMark)
  return entry
}

export const draft: StepFn = async (ctx, key, state) => {
  const n = chapterOf(key)
  const created = `ch${n}:chapter-created`
  if (isMarked(state, created)) return 'done'
  const spec = chapterSpec(ctx, n)
  const instructions = chapterInstructions(ctx.bible, n, ctx.config)
  const workId = requireWorkId(state)

  // Ledger mode plants the probes before chapter 1's first plan or draft call. Planting is idempotent.
  if (n === 1 && ctx.config.directivesMode === 'ledger' && !state.data.planted) {
    state.data.planted = await plantLedger(ctx, workId)
    persist(ctx, state)
  }

  // The chapter was saved before its mark was: adopt it, never draft it again.
  const existing = await chapterAt(ctx, workId, n)
  if (existing) {
    state.data.chapterIds[n] = existing
    mark(ctx, state, created)
    return 'done'
  }

  const attempts = (state.data.drafts[n] ??= [])
  const maxAttempts = ctx.config.maxDraftAttempts

  // Stage 1: the approved card comes before the first attempt. A quick run has none (null).
  const plan = await approvedPlan(ctx, state, key, n, workId, instructions)
  if (plan === 'pending') return 'pending'
  if (plan === 'failed') return 'done'

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
        instructions,
      )
      // The card is the draft's instructions; a quick run sends none of these keys.
      const planInput = plan
        ? {
            plan: plan.card,
            planRunId: plan.runId,
            planNotes: [...plan.notes],
            planEdits: {
              revisions: plan.notes.length,
              removed: 0,
              moved: 0,
              textEdits: 0,
            },
            mode: ctx.config.draftMode ?? 'single',
          }
        : {}
      const generated = await withModelRetry(ctx, state, key, async () => {
        const run = await startDraft(
          ctx.db,
          ctx.actor,
          {
            workId,
            instructions,
            targetChars: ctx.bible.targetChars,
            entryIds,
            // The scene beat list is made first and goes into the prose. Local profiles always do it;
            // cloud profiles only with --two-step on, so their default baseline stays comparable.
            // A plan card already sets the scenes, so the beat list is not made on top of it.
            twoStep: plan ? false : twoStepOn(ctx),
            ...planInput,
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
        'scenes-cut.json',
        'trim.json',
        'draft.trimmed.txt',
        'draft.foreign-repaired.txt',
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
      // A scenes-mode draft that stopped early: its failure is taken here for the same reason.
      if (plan && ctx.config.draftMode === 'scenes') {
        await recordScenesCut(ctx, generated.runId, n, attemptNo, plan.card.scenes.length)
      }
      // Stage 3: the check runs on the stored draft, before trim and repair.
      const checkedText = await checkFixStage(
        ctx,
        state,
        key,
        workId,
        generated.runId,
        generated.text,
      )
      // E1 then E2, each stage on the text the previous one returned (spec 7).
      const trimmedText = await trimStage(
        ctx,
        state,
        key,
        workId,
        checkedText,
        attemptNo,
        generated.runId,
      )
      // C (ko, local profiles only): the sentences with foreign script (Han, kana, Cyrillic, U+FFFD)
      // are repaired once on the trimmed text, before E2. Best effort, see repairBestEffort. Its calls
      // carry the step `${key}:foreign-repair`; the step is set back to `key` afterwards. The cloud
      // profiles had no foreign script, so their runs stay as they were.
      let stageText = trimmedText
      const foreignRepairOn = ctx.config.lang === 'ko' && isLocalProfile(ctx)
      const foreignFound = foreignRepairOn ? repairableForeignSpans(trimmedText).length : 0
      const foreignRepair = { replaced: 0 }
      if (foreignFound > 0) {
        ctx.client.setStep(`${key}:foreign-repair`)
        try {
          stageText = await repairBestEffort(
            ctx,
            state,
            `${key}:foreign-repair`,
            async () => {
              const repaired = await repairDraftForeignScript(
                ctx.db,
                ctx.actor,
                { workId, runId: generated.runId, text: trimmedText },
                ctx.client,
              )
              foreignRepair.replaced = repaired.replaced
              return repaired
            },
            trimmedText,
          )
        } finally {
          ctx.client.setStep(key)
        }
        if (stageText !== trimmedText) {
          writeRunFile(ctx.dir, `${stem}.draft.foreign-repaired.txt`, stageText)
        }
      }
      // E2: one repair on the text after C (after A's continuation). Best effort, see repairBestEffort.
      // It starts from that text, which is also what repairDraft stores when it runs.
      const repairedText = await repairBestEffort(
        ctx,
        state,
        `${key}:repair`,
        () =>
          repairDraft(
            ctx.db,
            ctx.actor,
            { workId, runId: generated.runId, lang: ctx.config.lang, text: stageText },
            ctx.client,
          ),
        stageText,
      )
      if (repairedText !== stageText) {
        writeRunFile(ctx.dir, `${stem}.draft.repaired.txt`, repairedText)
      }
      writeRunFile(ctx.dir, `chapters/${pad(n)}.attempt-${attemptNo}.md`, repairedText)
      // The figures are counted on the final text: E2's rewrite could bring foreign script back.
      const foreign =
        foreignFound > 0
          ? {
              found: foreignFound,
              replaced: foreignRepair.replaced,
              unresolved: repairableForeignSpans(repairedText).length,
            }
          : undefined
      attempts.push({
        runId: generated.runId,
        usable: null,
        quality: null,
        reason: '',
        ...(foreign ? { foreign } : {}),
      })
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
      instructions,
      // Few-instruction runs never list the bible's mustInclude items, so the author is not asked to judge them.
      mustInclude: ctx.config.fewInstructions ? [] : spec.mustInclude,
      textFile,
      metrics: chapterMetrics(
        text,
        ctx.config.lang,
        ctx.bible.targetChars,
        [ctx.bible.workStyle.examples],
        bibleExempt(ctx.bible),
        planTargetsOf(state.data.plans?.[n]),
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
        planTargetsOf(state.data.plans?.[n]),
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
  // P3: two-step runs give the check the chosen draft's location list; a plan card gives its scenes'
  // places. Other runs send no plan.
  const card = state.data.plans?.[n]?.card
  const scenePlan =
    twoStepOn(ctx) || card ? sceneLocationsOf(ctx.dir, state.data.drafts[n] ?? [], n, card) : null
  const checked = await withModelRetry(ctx, state, key, () =>
    runChapterCheck(
      ctx.db,
      ctx.actor,
      { chapterId, ...(scenePlan ? { scenePlan } : {}) },
      ctx.client,
    ),
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
 * Location list of the chosen draft attempt for the continuity check (P3, two-step eval runs). The
 * chosen attempt is the one the `draft` step saved (pickAttempt). With a plan card (stage 1), the
 * list is the card's scenes' places and people. Null when there is no attempt, no beats file (a
 * one-step draft without a card) or the file does not parse: the check then runs as before. Never throws.
 */
export function sceneLocationsOf(
  dir: string,
  attempts: DraftAttempt[],
  n: number,
  card?: DraftPlanCard,
): string | null {
  if (card) return renderCardLocations(card)
  if (attempts.length === 0) return null
  const attemptNo = attempts.indexOf(pickAttempt(attempts)) + 1
  const file = `chapters/${pad(n)}.attempt-${attemptNo}.beats.json`
  if (!existsSync(path.join(dir, file))) return null
  try {
    const parsed = DraftBeatsSchema.safeParse(JSON.parse(readRunFile(dir, file)))
    return parsed.success ? renderBeatLocations(parsed.data) : null
  } catch {
    return null
  }
}

/** The card's scenes as the check reads them: place and people, the same lines as the beat list. */
function renderCardLocations(card: DraftPlanCard): string {
  if (card.scenes.length === 0) return '(없음)'
  return card.scenes
    .map((scene, index) => {
      const people = scene.characters.length > 0 ? scene.characters.join(', ') : '(없음)'
      return [`장면 ${index + 1}`, `장소: ${scene.place || '(없음)'}`, `인물: ${people}`].join('\n')
    })
    .join('\n\n')
}

/** The local queue profiles run C's foreign-script repair; cloud ones do not. */
function isLocalProfile(ctx: RunContext): boolean {
  return MODEL_PROFILES[ctx.config.modelId].queue === 'local'
}

/** Two-step draft (beat list) and scene rewrite: on for local profiles, opt-in (--two-step on) otherwise. */
function twoStepOn(ctx: RunContext): boolean {
  return twoStepEnabled(MODEL_PROFILES[ctx.config.modelId], ctx.config.twoStep)
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
  let alreadySaved = false
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
    // A body that differs from the pre-rewrite copy was saved by an earlier call that crashed before
    // its files were written. The service is not called again on it: the issues would be skipped as
    // span-mismatch, or a second rewrite could follow.
    // The premise: in the eval nothing but the rewrite service writes the chapter body after the
    // pre-rewrite copy is taken, so a different body means that save happened. The recovered record
    // takes its runId from the latest done scene-rewrite row of the chapter, which may be null.
    const current = (await getChapter(ctx.db, ctx.actor, chapterId)).body
    alreadySaved =
      existsSync(path.join(ctx.dir, preFile)) && current !== readRunFile(ctx.dir, preFile)
    if (!alreadySaved) {
      const outcome = await guarded(ctx, state, key, () =>
        rewriteFlaggedScenes(ctx.db, ctx.actor, { chapterId, issueIds: ids }, ctx.client),
      )
      // A content error is already in `failed`: no rewrite files are written.
      if (outcome === null) return
      result = outcome
    }
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
        planTargetsOf(state.data.plans?.[n]),
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
  // The save happened in a call that did not write its record. The rewrite is taken as applied to
  // the issues of this stage; the run id is the latest finished scene rewrite of the chapter.
  if (alreadySaved && !existsSync(path.join(ctx.dir, rewritesFile))) {
    const [latest] = await ctx.db
      .select({ id: aiRuns.id })
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.task, 'scene-rewrite'),
          eq(aiRuns.chapterId, chapterId),
          eq(aiRuns.status, 'done'),
        ),
      )
      .orderBy(desc(aiRuns.createdAt))
      .limit(1)
    writeRunFile(
      ctx.dir,
      rewritesFile,
      `${JSON.stringify(
        { rewritten: [{ issueIds: ids, runId: latest?.id ?? null }], skipped: [], recovered: true },
        null,
        2,
      )}\n`,
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
  // Local profiles always rewrite; other profiles only with --two-step on. Without it a cloud run
  // records the accepted issue and leaves the body alone.
  if (twoStepOn(ctx) && !isMarked(state, rewrittenKey)) {
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
