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
  price?: ModelPrice
  settings: 'deploy' | 'eval'
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
      usd: UsdSchema,
      firstCharMs: MsSchema.nullable(),
      writeMs: MsSchema,
      afterSaveMs: MsSchema,
      totalMs: MsSchema,
      regenerations: CountSchema,
      instructionChars: CountSchema,
    }),
  ),
  interview: z.object({
    calls: CountSchema,
    inputTokens: CountSchema,
    outputTokens: CountSchema,
    usd: UsdSchema,
    totalMs: MsSchema,
  }),
  total: z.object({ calls: CountSchema, usd: UsdSchema, totalMs: MsSchema }),
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

/** Sum of the tokens over the calls; cost is null without a price. A failed call counts its billed usage. */
function tally(calls: CallRecord[], price: ModelPrice | undefined) {
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let usd = price ? 0 : null
  let totalMs = 0
  for (const call of calls) {
    const usage = call.usage ?? NO_USAGE
    inputTokens += usage.inputTokens
    outputTokens += usage.outputTokens
    cacheReadTokens += usage.cacheReadTokens ?? 0
    cacheWriteTokens += usage.cacheWriteTokens ?? 0
    if (price && usd !== null) usd += callCostUsd(usage, price)
    totalMs += call.durationMs
  }
  return {
    calls: calls.length,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    usd,
    totalMs,
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
    const writeMs = writes.reduce((sum, call) => sum + call.durationMs, 0)
    const afterSaveMs = afterSave.reduce((sum, call) => sum + call.durationMs, 0)
    chapters.push({
      n,
      calls: all.calls,
      inputTokens: all.inputTokens,
      outputTokens: all.outputTokens,
      cacheReadTokens: all.cacheReadTokens,
      cacheWriteTokens: all.cacheWriteTokens,
      usd: all.usd,
      firstCharMs: firstCharMs(writes),
      writeMs,
      afterSaveMs,
      totalMs: writeMs + afterSaveMs,
      regenerations: Math.max(0, (o.drafts[n]?.length ?? 0) - 1),
      instructionChars: Array.from(o.instructions(n)).length,
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
      usd: interview.usd,
      totalMs: interview.totalMs,
    },
    total: { calls: total.calls, usd: total.usd, totalMs: total.totalMs },
  }
}
