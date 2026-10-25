import { z } from 'zod'
import type { AiUsage } from '@/ai/types'
import type { CallRecord } from './eval-client'
import type { ModelPrice } from './models'
import type { DraftAttempt } from './state'

// The chapter cost, time and intervention block of the run summary (stage 0). Pure: the caller
// passes the call records, the drafts and the price. Times follow the design's section 6.6.

export type HarnessInput = {
  chapters: number
  drafts: Record<number, DraftAttempt[]>
  /** The chapter's instruction text, as the author got it. */
  instructions: (n: number) => string
  /** The author's plan notes per chapter (few-instruction runs). Absent or empty means no edits. */
  plans?: Record<number, { notes: string[] }>
  price?: ModelPrice
  settings: 'deploy' | 'eval'
  /** Ledger mode: the planted probe texts' characters, counted on chapter 1 (0 or absent otherwise). */
  ledgerChars?: number
  /** Applied voice-fix lines per chapter, from the run state. Absent on old runs. */
  voiceApplied?: Record<number, number>
}

const CountSchema = z.number().int().nonnegative()
const MsSchema = z.number().nonnegative()
const UsdSchema = z.number().nonnegative().nullable()

export const HarnessSummarySchema = z.object({
  settings: z.enum(['deploy', 'eval']),
  priceSource: z.string().nullable(),
  chapters: z.array(
    z.object({
      n: CountSchema,
      calls: CountSchema,
      inputTokens: CountSchema,
      outputTokens: CountSchema,
      cacheReadTokens: CountSchema,
      cacheWriteTokens: CountSchema,
      cacheRecorded: z.boolean(),
      usd: UsdSchema,
      firstCharMs: MsSchema.nullable(),
      writeMs: MsSchema,
      // Stage 1: the plan call's time (apart from writeMs), the author's plan edits and their length.
      // Saved runs from before stage 1 lack these keys; they read as 0.
      planMs: MsSchema.default(0),
      planEdits: CountSchema.default(0),
      planEditChars: CountSchema.default(0),
      afterSaveMs: MsSchema,
      totalMs: MsSchema,
      regenerations: CountSchema,
      instructionChars: CountSchema,
      // Stage 1b: expansion calls of the chapter's draft (their time is already in writeMs). Saved runs from before stage 1b read as 0.
      expandCalls: CountSchema.default(0),
      // Stage 2: cached input tokens over all input tokens of the chapter's calls; ledger characters (chapter 1). Older runs read as 0.
      cacheReadShare: z.number().min(0).max(1).default(0),
      ledgerChars: CountSchema.default(0),
      // Stage 3: stalled cloud calls of the chapter. Older runs read as 0.
      stalls: CountSchema.default(0),
      // Stage 3: picked scenes, applied fixes and the check time of the chapter. Older runs read as 0.
      checkFlagged: CountSchema.default(0),
      sceneFixes: CountSchema.default(0),
      voiceFixes: CountSchema.default(0),
      voiceProposed: CountSchema.default(0),
      checkMs: MsSchema.default(0),
    }),
  ),
  interview: z.object({
    calls: CountSchema,
    inputTokens: CountSchema,
    outputTokens: CountSchema,
    cacheRecorded: z.boolean(),
    usd: UsdSchema,
    totalMs: MsSchema,
  }),
  total: z.object({
    calls: CountSchema,
    usd: UsdSchema,
    totalMs: MsSchema,
    cacheReadShare: z.number().min(0).max(1).default(0),
    ledgerChars: CountSchema.default(0),
    stalls: CountSchema.default(0),
  }),
})
export type HarnessSummary = z.infer<typeof HarnessSummarySchema>
export type ChapterHarness = HarnessSummary['chapters'][number]

/**
 * What one call costs at the given list price. Uncached input is the input tokens that were not
 * read from or written to the cache.
 */
export function callCostUsd(usage: AiUsage, price: ModelPrice): number {
  const cacheRead = usage.cacheReadTokens ?? 0
  const cacheWrite = usage.cacheWriteTokens ?? 0
  const uncached = Math.max(0, usage.inputTokens - cacheRead - cacheWrite)
  return (
    (uncached * price.inputPerMTok +
      cacheRead * price.cacheReadPerMTok +
      cacheWrite * price.cacheWritePerMTok +
      usage.outputTokens * price.outputPerMTok) /
    1_000_000
  )
}

const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0 }

/**
 * Sum of the tokens over the calls; cost is null without a price. A failed call counts its billed usage.
 * cacheRecorded is false when no call carries a cache key, so the cache values are not known.
 */
function tally(calls: CallRecord[], price: ModelPrice | undefined) {
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let cacheRecorded = false
  let usd = price ? 0 : null
  let totalMs = 0
  for (const call of calls) {
    const usage = call.usage ?? NO_USAGE
    inputTokens += usage.inputTokens
    outputTokens += usage.outputTokens
    cacheReadTokens += usage.cacheReadTokens ?? 0
    cacheWriteTokens += usage.cacheWriteTokens ?? 0
    if (usage.cacheReadTokens !== undefined || usage.cacheWriteTokens !== undefined) {
      cacheRecorded = true
    }
    if (price && usd !== null) usd += callCostUsd(usage, price)
    totalMs += call.durationMs
  }
  return {
    calls: calls.length,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheRecorded,
    usd,
    totalMs,
    cacheReadShare: inputTokens > 0 ? cacheReadTokens / inputTokens : 0,
  }
}

/** Write calls of a chapter: its draft step and the draft's own sub-steps. */
function isWriteCall(call: CallRecord, n: number): boolean {
  const step = call.step ?? ''
  return step === `ch${n}:draft` || step.startsWith(`ch${n}:draft:`)
}

/**
 * The stage 1 plan call, which the design times apart from the write. No task of this name exists
 * yet; it is typed as a string so the rule holds once one does.
 */
const PLAN_TASK: string = 'draft-plan'

/** The stage 1b expansion call of a short draft's scenes; counted in writeMs like the draft's calls. */
const EXPAND_TASK: string = 'draft-expand'

/** The stage 3 check call, the one-scene fix call and the voice-fix call; all belong to the draft step. */
const CHECK_TASK: string = 'draft-check'
const SCENE_FIX_TASK: string = 'scene-fix'
const VOICE_FIX_TASK: string = 'voice-fix'

/** Scenes the check named, from a draft-check call output. Unknown shapes count as none. */
function flaggedScenesOf(output: unknown): number {
  if (typeof output !== 'object' || output === null) return 0
  const scenes = (output as { scenes?: unknown }).scenes
  return Array.isArray(scenes) ? scenes.length : 0
}

/** Proposed lines of a voice-fix call output. Unknown shapes count as none. */
function voiceLinesOf(output: unknown): number {
  if (typeof output !== 'object' || output === null) return 0
  const lines = (output as { lines?: unknown }).lines
  return Array.isArray(lines) ? lines.length : 0
}

/**
 * Milliseconds from the start of the draft to the first character: the write calls before the
 * first chapter stream, minus the stage 1 plan call, plus that stream's first token time. Null when
 * the stream or its first token is missing.
 */
function firstCharMs(writes: CallRecord[]): number | null {
  const ordered = [...writes].sort((a, b) => a.seq - b.seq)
  const streamIndex = ordered.findIndex(
    (call) => call.task === 'draft-chapter' && call.kind === 'stream',
  )
  const stream = ordered[streamIndex]
  if (!stream || stream.firstTokenMs === null || stream.firstTokenMs === undefined) return null
  const before = ordered
    .slice(0, streamIndex)
    .filter((call) => call.task !== PLAN_TASK)
    .reduce((sum, call) => sum + call.durationMs, 0)
  return before + stream.firstTokenMs
}

/** The harness block: per-chapter and interview cost and time, plus the run total. */
export function harnessSummary(records: CallRecord[], o: HarnessInput): HarnessSummary {
  const chapters: ChapterHarness[] = []
  for (let n = 1; n <= o.chapters; n += 1) {
    const mine = records.filter((call) => (call.step ?? '').startsWith(`ch${n}:`))
    const writes = mine.filter((call) => isWriteCall(call, n))
    const afterSave = mine.filter((call) => !isWriteCall(call, n))
    const all = tally(mine, o.price)
    // The plan call is timed apart from the write, so writeMs is the draft's own calls only.
    const planCalls = writes.filter((call) => call.task === PLAN_TASK)
    const planMs = planCalls.reduce((sum, call) => sum + call.durationMs, 0)
    const drafting = writes.filter((call) => call.task !== PLAN_TASK)
    const writeMs = drafting.reduce((sum, call) => sum + call.durationMs, 0)
    const afterSaveMs = afterSave.reduce((sum, call) => sum + call.durationMs, 0)
    const notes = o.plans?.[n]?.notes ?? []
    chapters.push({
      n,
      calls: all.calls,
      inputTokens: all.inputTokens,
      outputTokens: all.outputTokens,
      cacheReadTokens: all.cacheReadTokens,
      cacheWriteTokens: all.cacheWriteTokens,
      cacheRecorded: all.cacheRecorded,
      usd: all.usd,
      firstCharMs: firstCharMs(writes),
      writeMs,
      planMs,
      planEdits: notes.length,
      planEditChars: notes.reduce((sum, note) => sum + Array.from(note).length, 0),
      afterSaveMs,
      totalMs: writeMs + planMs + afterSaveMs,
      regenerations: Math.max(0, (o.drafts[n]?.length ?? 0) - 1),
      instructionChars: Array.from(o.instructions(n)).length,
      expandCalls: drafting.filter((call) => call.task === EXPAND_TASK).length,
      cacheReadShare: all.cacheReadShare,
      ledgerChars: n === 1 ? (o.ledgerChars ?? 0) : 0,
      stalls: mine.filter((call) => call.stalled === true).length,
      checkFlagged: writes
        .filter((call) => call.task === CHECK_TASK)
        .reduce((sum, call) => sum + flaggedScenesOf(call.output), 0),
      sceneFixes: writes.filter((call) => call.task === SCENE_FIX_TASK).length,
      voiceFixes: o.voiceApplied?.[n] ?? 0,
      voiceProposed: writes
        .filter((call) => call.task === VOICE_FIX_TASK)
        .reduce((sum, call) => sum + voiceLinesOf(call.output), 0),
      checkMs: writes
        .filter(
          (call) =>
            call.task === CHECK_TASK ||
            call.task === SCENE_FIX_TASK ||
            call.task === VOICE_FIX_TASK,
        )
        .reduce((sum, call) => sum + call.durationMs, 0),
    })
  }

  const interview = tally(
    records.filter((call) => (call.step ?? '').startsWith('interview')),
    o.price,
  )
  const total = tally(records, o.price)
  return {
    settings: o.settings,
    priceSource: o.price?.source ?? null,
    chapters,
    interview: {
      calls: interview.calls,
      inputTokens: interview.inputTokens,
      outputTokens: interview.outputTokens,
      cacheRecorded: interview.cacheRecorded,
      usd: interview.usd,
      totalMs: interview.totalMs,
    },
    total: {
      calls: total.calls,
      usd: total.usd,
      totalMs: total.totalMs,
      cacheReadShare: total.cacheReadShare,
      ledgerChars: o.ledgerChars ?? 0,
      stalls: records.filter((call) => call.stalled === true).length,
    },
  }
}
