import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import { DEFAULT_AI_TIMEOUT_MS } from '@/ai/run'
import { listFacts } from '@/server/facts'
import { listNamingRules } from '@/server/naming'
import { listRelations } from '@/server/relations'
import { listStyleCards } from '@/server/styles'
import { listThreads } from '@/server/threads'
import { listEntries } from '@/server/wiki'
import { packCoverage } from '../../coverage'
import { chapterInstructions } from '../instructions'
import { loadRunBible } from '../bible'
import {
  directiveCounts,
  directiveResults,
  type DirectiveResults,
  ledgerCharsOf,
} from '../directives'
import type { CallRecord, CallSpeed, FailureKind } from '../eval-client'
import { harnessSummary, type HarnessInput, HarnessSummarySchema } from '../harness-summary'
import { interviewMetrics } from '../metrics-interview'
import { type ProofreadStats, proofreadStats } from '../metrics-proofread'
import { type ModelId, MODEL_IDS, MODEL_PROFILES } from '../models'
import { powerSummary } from '../power'
import type { StepFn } from '../run'
import type { RunState } from '../state'
import { readCallRecords, requireWorkId, writeRunFile } from './util'

// Writes the final wiki snapshot and the run summary. Calls are read from disk, so the summary
// covers every resume, not only this process.

const NO_SPEED: CallSpeed = { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' }

/** Records written before speed was recorded have no speed block. */
function recordSpeed(call: CallRecord): CallSpeed {
  return call.speed ?? NO_SPEED
}

/** Median of the numeric values; null when there are none. */
function median(values: (number | null | undefined)[]): number | null {
  const sorted = values.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const middle = sorted.length / 2
  if (sorted.length % 2 === 1) return sorted[Math.floor(middle)] ?? null
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/** A call counts as slow when its output rate is below this share of the run's usual rate. */
const SLOW_RATIO = 0.7
/** Fewer qualifying calls than this and there is no usual rate to compare with. */
const SLOW_MIN_CALLS = 5
/** Shorter outputs give a noisy rate, so they are left out of the baseline. */
const SLOW_MIN_OUTPUT_TOKENS = 50

export type SlowCall = {
  seq: number
  task: string
  step: string | null
  outputTokensPerSec: number
  /** The call's rate divided by the usual rate. */
  ratio: number
}

/**
 * Local calls whose output rate is under 70% of the run's usual rate (the median of the qualifying
 * calls). Null when fewer than five calls qualify. Works on records written before M2.
 */
export function slowSummary(calls: CallRecord[]): {
  thresholdRatio: number
  usualOutputTokensPerSec: number
  calls: SlowCall[]
} | null {
  const qualifying = [...calls]
    .sort((a, b) => a.seq - b.seq)
    .filter(
      (c) =>
        !c.error &&
        recordSpeed(c).source === 'ollama' &&
        typeof recordSpeed(c).outputTokensPerSec === 'number' &&
        (c.usage?.outputTokens ?? 0) >= SLOW_MIN_OUTPUT_TOKENS,
    )
  if (qualifying.length < SLOW_MIN_CALLS) return null
  const usual = median(qualifying.map((c) => recordSpeed(c).outputTokensPerSec))
  if (usual === null || usual <= 0) return null

  const slow: SlowCall[] = []
  for (const call of qualifying) {
    const rate = recordSpeed(call).outputTokensPerSec ?? 0
    const ratio = rate / usual
    if (ratio < SLOW_RATIO) {
      slow.push({
        seq: call.seq,
        task: call.task,
        step: call.step,
        outputTokensPerSec: rate,
        ratio,
      })
    }
  }
  return { thresholdRatio: SLOW_RATIO, usualOutputTokensPerSec: usual, calls: slow }
}

/**
 * Where the time of the local calls went: Ollama's load, prompt, generation and other time, and
 * the time outside Ollama's timer. Null when no call has an ollama block. The parts add up to
 * wallMs for the timed calls.
 */
export function ollamaSummary(calls: CallRecord[]): {
  calls: number
  attempts: number
  retried: number
  lengthCut: number
  cacheSuspected: number
  thinking: { chunks: number; chars: number }
  timed: {
    calls: number
    wallMs: number
    loadMs: number
    promptEvalMs: number
    evalMs: number
    otherMs: number
    unaccountedMs: number
    unaccountedShare: number | null
    unaccountedByTask: Record<string, number>
  }
} | null {
  const rows = calls.filter((c) => c.ollama && c.ollama.attempts.length > 0)
  if (rows.length === 0) return null

  const allAttempts = rows.flatMap((c) => c.ollama?.attempts ?? [])
  const timedRows = rows.filter((c) => typeof c.ollama?.unaccountedMs === 'number')
  const timedAttempts = timedRows.flatMap((c) => c.ollama?.attempts ?? [])
  const sum = (values: (number | null)[]) => values.reduce<number>((t, v) => t + (v ?? 0), 0)

  const unaccountedByTask: Record<string, number> = {}
  for (const call of timedRows) {
    const unaccounted = call.ollama?.unaccountedMs ?? 0
    unaccountedByTask[call.task] = (unaccountedByTask[call.task] ?? 0) + unaccounted
  }
  const wallMs = sum(timedRows.map((c) => c.durationMs))
  const unaccountedMs = sum(timedRows.map((c) => c.ollama?.unaccountedMs ?? 0))

  return {
    calls: rows.length,
    attempts: allAttempts.length,
    retried: rows.filter((c) => (c.ollama?.attempts.length ?? 0) > 1).length,
    lengthCut: allAttempts.filter((a) => a.doneReason === 'length').length,
    cacheSuspected: rows.filter((c) => c.ollama?.promptCacheSuspected === true).length,
    thinking: {
      chunks: sum(allAttempts.map((a) => a.thinkingChunks)),
      chars: sum(allAttempts.map((a) => a.thinkingChars)),
    },
    timed: {
      calls: timedRows.length,
      wallMs,
      loadMs: sum(timedAttempts.map((a) => a.loadMs)),
      promptEvalMs: sum(timedAttempts.map((a) => a.promptEvalMs)),
      evalMs: sum(timedAttempts.map((a) => a.evalMs)),
      otherMs: sum(timedAttempts.map((a) => a.otherMs)),
      unaccountedMs,
      unaccountedShare: wallMs === 0 ? null : unaccountedMs / wallMs,
      unaccountedByTask,
    },
  }
}

/** Speed medians per task and for the whole run, and the total call time of each chapter. */
export function speedSummary(calls: CallRecord[]) {
  const medians = (rows: CallRecord[]) => ({
    medianOutputTokensPerSec: median(rows.map((c) => recordSpeed(c).outputTokensPerSec)),
    medianPromptTokensPerSec: median(rows.map((c) => recordSpeed(c).promptTokensPerSec)),
  })

  const byTask: Record<
    string,
    ReturnType<typeof medians> & { calls: number; medianFirstTokenMs: number | null }
  > = {}
  for (const task of new Set(calls.map((c) => c.task))) {
    const rows = calls.filter((c) => c.task === task)
    byTask[task] = {
      calls: rows.length,
      ...medians(rows),
      medianFirstTokenMs: median(rows.map((c) => c.firstTokenMs)),
    }
  }

  // Chapter n is the calls whose step key starts with 'chN:'. The wall time merges their intervals,
  // so calls that overlap count once, and the gaps between them (the author's wait) count zero.
  // Calls on a local server run one at a time, while cloud calls can still overlap. A call's
  // interval starts when it was requested, so its lane wait (queueMs) counts. The model time is the
  // plain sum of the call durations, which leaves the lane wait out.
  const chapterIntervals: Record<string, [number, number][]> = {}
  const perChapterModelMs: Record<string, number> = {}
  for (const call of calls) {
    const chapter = /^ch(\d+):/.exec(call.step ?? '')?.[1]
    if (chapter === undefined) continue
    perChapterModelMs[chapter] = (perChapterModelMs[chapter] ?? 0) + call.durationMs
    const startedMs = Date.parse(call.startedAt)
    chapterIntervals[chapter] ??= []
    if (Number.isFinite(startedMs)) {
      chapterIntervals[chapter].push([startedMs - (call.queueMs ?? 0), startedMs + call.durationMs])
    }
  }
  const perChapterMs: Record<string, number> = {}
  for (const [chapter, intervals] of Object.entries(chapterIntervals)) {
    perChapterMs[chapter] = mergedMs(intervals)
  }

  const source: CallSpeed['source'] = calls.some((c) => recordSpeed(c).source === 'ollama')
    ? 'ollama'
    : 'wall'
  const slow = slowSummary(calls)
  const ollama = ollamaSummary(calls)
  return {
    byTask,
    overall: { ...medians(calls), source },
    perChapterMs,
    perChapterModelMs,
    ...(slow ? { slow } : {}),
    ...(ollama ? { ollama } : {}),
  }
}

/** Total length of the union of the intervals, in ms. */
export function mergedMs(intervals: [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let total = 0
  let current: [number, number] | null = null
  for (const [start, end] of sorted) {
    if (current && start <= current[1]) {
      current[1] = Math.max(current[1], end)
    } else {
      if (current) total += current[1] - current[0]
      current = [start, end]
    }
  }
  if (current) total += current[1] - current[0]
  return total
}

// ---- Run summary schema ----
// Saved summaries from before a block existed still parse: every block added after the first
// version is optional, and a block that was not measured is left out, never written as zeros.

const CountSchema = z.number().int().nonnegative()
const NullableNumberSchema = z.number().nullable()

/** Planted directive counts per chapter (`--directives on`). Absent on runs without directives. */
const DirectivesBlockSchema = z.object({
  chapters: z.array(
    z.object({
      n: z.number().int().positive(),
      kept: CountSchema,
      broken: CountSchema,
      na: CountSchema,
    }),
  ),
})

/** G2 stats and G1 dropped counters of one chapter extraction, and P10 weak-evidence counters. */
export const ExtractionCountsSchema = z.object({
  fragmentNamesFixed: CountSchema,
  relationsDropped: CountSchema,
  duplicateFacts: CountSchema,
  unverifiedEvidence: CountSchema,
  // P10: optional, because chapters saved before it have neither. Zod strips unknown keys, so
  // without these two lines the values would vanish from the summary.
  weakFactEvidence: CountSchema.optional(),
  weakThreadEvidence: CountSchema.optional(),
})
export type ExtractionCounts = z.infer<typeof ExtractionCountsSchema>

/** Mirrors ProofreadStats (metrics-proofread.ts, track J). */
export const ProofreadStatsSchema = z.object({
  total: CountSchema,
  accepted: CountSchema,
  acceptanceRatio: NullableNumberSchema,
  awkward: CountSchema,
  sameQuoteItems: CountSchema,
  distinctQuotes: CountSchema,
  acceptedQuotes: CountSchema,
  quoteAcceptanceRatio: NullableNumberSchema,
})

const ContinuityFixtureSchema = z.object({
  createdAt: z.string(),
  mode: z.string(),
  model: z.string(),
  expected: CountSchema,
  hits: CountSchema,
  misses: CountSchema,
  falsePositives: CountSchema,
  precision: NullableNumberSchema,
  recall: NullableNumberSchema,
  trapHits: CountSchema.optional(),
  coverage: z.object({ named: CountSchema, inPack: CountSchema, rate: z.number() }).optional(),
  overBudgetChapters: CountSchema.optional(),
})
/** A `run-continuity.ts` results file, as read by `parseContinuityResults`. */
export type ContinuityFixture = z.infer<typeof ContinuityFixtureSchema>

const CallCountsSchema = z.object({
  total: CountSchema,
  byTask: z.record(
    z.string(),
    z.object({ count: CountSchema, tokens: CountSchema, totalMs: z.number() }),
  ),
})

const SpeedSchema = z.object({
  byTask: z.record(
    z.string(),
    z.object({
      calls: CountSchema,
      medianOutputTokensPerSec: NullableNumberSchema,
      medianPromptTokensPerSec: NullableNumberSchema,
      medianFirstTokenMs: NullableNumberSchema,
    }),
  ),
  overall: z.object({
    medianOutputTokensPerSec: NullableNumberSchema,
    medianPromptTokensPerSec: NullableNumberSchema,
    source: z.enum(['ollama', 'wall']),
  }),
  perChapterMs: z.record(z.string(), z.number()),
  perChapterModelMs: z.record(z.string(), z.number()),
  slow: z
    .object({
      thresholdRatio: z.number(),
      usualOutputTokensPerSec: z.number(),
      calls: z.array(
        z.object({
          seq: CountSchema,
          task: z.string(),
          step: z.string().nullable(),
          outputTokensPerSec: z.number(),
          ratio: z.number(),
        }),
      ),
    })
    .optional(),
  ollama: z
    .object({
      calls: CountSchema,
      attempts: CountSchema,
      retried: CountSchema,
      lengthCut: CountSchema,
      cacheSuspected: CountSchema,
      thinking: z.object({ chunks: CountSchema, chars: CountSchema }),
      timed: z.object({
        calls: CountSchema,
        wallMs: z.number(),
        loadMs: z.number(),
        promptEvalMs: z.number(),
        evalMs: z.number(),
        otherMs: z.number(),
        unaccountedMs: z.number(),
        unaccountedShare: NullableNumberSchema,
        unaccountedByTask: z.record(z.string(), z.number()),
      }),
    })
    .optional(),
})

const InterviewSchema = z.object({
  asked: CountSchema,
  answered: CountSchema,
  undecided: CountSchema,
  undecidedShare: z.number(),
  setting: CountSchema,
  story: CountSchema,
  storyShare: z.number(),
  duplicateQuestions: CountSchema,
  sameTopicAfterUndecided: CountSchema,
  multiAsk: CountSchema,
  storyAfterCoreDone: CountSchema,
  undecidedShareInBank: z.number(),
})

const TimeoutsSchema = z.object({
  total: CountSchema,
  byTask: z.record(z.string(), CountSchema),
})

const ExtractionBlockSchema = z.object({
  chapters: CountSchema,
  totals: ExtractionCountsSchema,
  byChapter: z.record(z.string(), ExtractionCountsSchema),
})

const ProofreadBlockSchema = z.object({
  chapters: CountSchema,
  totals: ProofreadStatsSchema,
  byChapter: z.record(z.string(), ProofreadStatsSchema),
})

const ContinuityBlockSchema = z.object({
  contextHit: z
    .object({
      chapters: CountSchema,
      named: CountSchema,
      inPack: CountSchema,
      rate: NullableNumberSchema,
      byChapter: z.record(z.string(), z.object({ named: CountSchema, inPack: CountSchema })),
    })
    .optional(),
  fixture: ContinuityFixtureSchema.optional(),
})

const DraftBlockSchema = z.object({
  continueFailed: z.object({
    total: CountSchema,
    external: CountSchema,
    byReason: z.record(z.string(), CountSchema),
    byChapter: z.record(z.string(), CountSchema),
  }),
  // Scenes-mode drafts that stopped before their last planned scene. Absent when none did.
  scenesCut: z
    .object({
      total: CountSchema,
      external: CountSchema,
      byFailure: z.record(z.string(), CountSchema),
      byChapter: z.record(z.string(), CountSchema),
    })
    .optional(),
})

/** Machine power over the sampled calls of a local run (track M1). Absent when nothing was sampled. */
const PowerBlockSchema = z.object({
  sampled: CountSchema,
  lowPower: CountSchema,
  onBattery: CountSchema,
  byMode: z.record(z.string(), CountSchema),
  bySource: z.record(z.string(), CountSchema),
})

const TaskCountsSchema = z.object({ total: CountSchema, byTask: z.record(z.string(), CountSchema) })

/** Output-cap counts (track M4). Absent on runs with no call that recorded its task limits. */
const OutputCapSchema = z.object({
  mode: z.enum(['floor', 'product']),
  cutOff: TaskCountsSchema,
  overTaskCap: TaskCountsSchema,
})

export const RunSummarySchema = z.object({
  calls: CallCountsSchema,
  speed: SpeedSchema,
  wouldTimeOut: CountSchema,
  contextOverflow: CountSchema,
  hangulLeft: z.number().nullable(),
  failed: z.array(z.object({ step: z.string(), message: z.string() })),
  pauses: z.record(z.string(), z.number()),
  drafts: z.record(
    z.string(),
    z.array(
      z.object({
        runId: z.string(),
        usable: z.boolean().nullable(),
        quality: z.number().nullable(),
        reason: z.string(),
        /** Foreign-script repair of the attempt's draft (track C); absent when the text had none. */
        foreign: z
          .object({ found: CountSchema, replaced: CountSchema, unresolved: CountSchema })
          .optional(),
      }),
    ),
  ),
  focusCounts: z.record(z.string(), z.number()),
  interview: InterviewSchema.optional(),
  timeouts: TimeoutsSchema.optional(),
  outputCap: OutputCapSchema.optional(),
  power: PowerBlockSchema.optional(),
  extraction: ExtractionBlockSchema.optional(),
  proofread: ProofreadBlockSchema.optional(),
  continuity: ContinuityBlockSchema.optional(),
  draft: DraftBlockSchema.optional(),
  directives: DirectivesBlockSchema.optional(),
  harness: HarnessSummarySchema.optional(),
})
export type RunSummary = z.infer<typeof RunSummarySchema>
/** What buildRunSummary produces today: always with the interview block, which old files lack. */
export type BuiltRunSummary = RunSummary & Required<Pick<RunSummary, 'interview'>>

// ---- Inputs that are not in the call records or the state ----

/** One extraction suggestion as `chapters/NN.proofread.json` holds it (only the fields read here). */
type SuggestionInput = { source: string; quote: string; replacement: string; kind: string }

/** A card as `wiki-final.json` holds it, with its creation time. */
type CardInput = { name: string; aliases: string[]; createdAt: string }

/** A continuation that failed, as `chapters/NN.attempt-K.continue.json` records it. */
export type ContinueFailure = { chapter: string; reason: string; failure: FailureKind }

/** A scenes-mode draft that was cut short, as `chapters/NN.attempt-K.scenes-cut.json` records it. */
export type ScenesCut = { chapter: string; failure: FailureKind | 'budget' }

export type SummaryInputs = {
  /** Key: chapter number as a string. */
  extraction?: Record<string, ExtractionCounts>
  /** Key: chapter number as a string. Decisions are the last decision line of the chapter. */
  proofread?: Record<
    string,
    { suggestions: SuggestionInput[]; decisions: { id: string; accept: boolean }[] }
  >
  contextHit?: { cards: CardInput[]; chapterTexts: Record<string, string> }
  continuityFixture?: ContinuityFixture
  continueFailures?: ContinueFailure[]
  scenesCuts?: ScenesCut[]
  /** Planted directive results of the saved chapters (`--directives on`). */
  directives?: DirectiveResults
  /** Cost and time inputs from the run config and its bible copy. Absent when the config is unreadable. */
  harness?: Omit<HarnessInput, 'drafts'>
}

// ---- Aggregators (pure) ----

/**
 * Calls over their own product timeout, per task. A stream has 280 s, an object call 120 s, and a
 * record written before productTimeoutMs existed counts against 120 s.
 */
export function timeoutSummary(calls: CallRecord[]): {
  total: number
  byTask: Record<string, number>
} {
  const byTask: Record<string, number> = {}
  let total = 0
  for (const call of calls) {
    const threshold = call.productTimeoutMs ?? DEFAULT_AI_TIMEOUT_MS
    if (call.durationMs <= threshold) continue
    total += 1
    byTask[call.task] = (byTask[call.task] ?? 0) + 1
  }
  return { total, byTask }
}

/**
 * Output tokens of one response. A call can hold several Ollama attempts (the plain-JSON retry), and
 * its usage is their sum. The largest attempt is used when every attempt reports evalCount; otherwise
 * the call usage. Null when the call has no usage.
 */
function responseOutputTokens(call: CallRecord): number | null {
  const attempts = call.ollama?.attempts ?? []
  if (attempts.length > 0 && attempts.every((a) => a.evalCount !== null)) {
    return Math.max(...attempts.map((a) => a.evalCount ?? 0))
  }
  return call.usage?.outputTokens ?? null
}

/**
 * Calls cut off by the output cap, and calls whose output went over the task's own cap, per task.
 * Only calls that record their task limits count; older records are skipped. Null when none does.
 */
export function outputCapSummary(calls: CallRecord[]): {
  mode: 'floor' | 'product'
  cutOff: { total: number; byTask: Record<string, number> }
  overTaskCap: { total: number; byTask: Record<string, number> }
} | null {
  const measured = calls.filter((call) => call.taskMaxTokens !== undefined)
  if (measured.length === 0) return null
  const cutOff = { total: 0, byTask: {} as Record<string, number> }
  const overTaskCap = { total: 0, byTask: {} as Record<string, number> }
  for (const call of measured) {
    const taskCap = call.taskMaxTokens ?? 0
    if (call.error?.message === MAX_TOKENS_MESSAGE) {
      cutOff.total += 1
      cutOff.byTask[call.task] = (cutOff.byTask[call.task] ?? 0) + 1
    }
    const response = responseOutputTokens(call)
    if (response !== null && response > taskCap) {
      overTaskCap.total += 1
      overTaskCap.byTask[call.task] = (overTaskCap.byTask[call.task] ?? 0) + 1
    }
  }
  const mode = measured.some((call) => call.maxTokensRule === 'product') ? 'product' : 'floor'
  return { mode, cutOff, overTaskCap }
}

/** Sums the four counters over the chapters, and the P10 weak counters when a chapter has them. */
function sumExtraction(
  byChapter: Record<string, ExtractionCounts>,
): NonNullable<RunSummary['extraction']> {
  const totals: ExtractionCounts = {
    fragmentNamesFixed: 0,
    relationsDropped: 0,
    duplicateFacts: 0,
    unverifiedEvidence: 0,
  }
  for (const counts of Object.values(byChapter)) {
    totals.fragmentNamesFixed += counts.fragmentNamesFixed
    totals.relationsDropped += counts.relationsDropped
    totals.duplicateFacts += counts.duplicateFacts
    totals.unverifiedEvidence += counts.unverifiedEvidence
  }
  // P10: a weak key is summed only when some chapter has it; the others count as zero.
  const values = Object.values(byChapter)
  if (values.some((c) => c.weakFactEvidence !== undefined)) {
    totals.weakFactEvidence = values.reduce((sum, c) => sum + (c.weakFactEvidence ?? 0), 0)
  }
  if (values.some((c) => c.weakThreadEvidence !== undefined)) {
    totals.weakThreadEvidence = values.reduce((sum, c) => sum + (c.weakThreadEvidence ?? 0), 0)
  }
  return { chapters: Object.keys(byChapter).length, totals, byChapter }
}

/**
 * AI proofread items only (source 'ai'), decided per chapter. The suggestion index is the decision
 * id, so the rule items are skipped without renumbering. Totals are sums over the chapters, with the
 * ratios recomputed from the sums. Null when no chapter has an AI item, so an unmeasured run has no block.
 */
export function proofreadSummary(
  perChapter: NonNullable<SummaryInputs['proofread']>,
): NonNullable<RunSummary['proofread']> | null {
  const byChapter: Record<string, ProofreadStats> = {}
  let decided = 0
  for (const [chapter, { suggestions, decisions }] of Object.entries(perChapter)) {
    const items = suggestions.flatMap((s, index) =>
      s.source === 'ai'
        ? [{ id: String(index), quote: s.quote, replacement: s.replacement, kind: s.kind }]
        : [],
    )
    // A decided chapter counts even when it has no AI item; only chapters with AI items get stats.
    decided += 1
    if (items.length === 0) continue
    byChapter[chapter] = proofreadStats(items, decisions)
  }
  const stats = Object.values(byChapter)
  if (stats.length === 0) return null
  const sum = (pick: (s: ProofreadStats) => number) => stats.reduce((t, s) => t + pick(s), 0)
  const total = sum((s) => s.total)
  const accepted = sum((s) => s.accepted)
  const distinctQuotes = sum((s) => s.distinctQuotes)
  const acceptedQuotes = sum((s) => s.acceptedQuotes)
  return {
    chapters: decided,
    totals: {
      total,
      accepted,
      acceptanceRatio: total === 0 ? null : accepted / total,
      awkward: sum((s) => s.awkward),
      sameQuoteItems: sum((s) => s.sameQuoteItems),
      distinctQuotes,
      acceptedQuotes,
      quoteAcceptanceRatio: distinctQuotes === 0 ? null : acceptedQuotes / distinctQuotes,
    },
    byChapter,
  }
}

/**
 * Share of the wiki cards named in a chapter that the continuity prompt of that chapter contained.
 * The prompt is the call of step `chN:check` (the last one that succeeded). A card created after
 * that call could not be in its pack, so it is left out. wiki-final.json is the end state, so a
 * card renamed after chapter n is judged by its final name (accepted drift). A chapter with no
 * usable call is skipped, not counted as zero. Null when no chapter qualifies.
 */
export function contextHitSummary(input: {
  cards: CardInput[]
  chapterTexts: Record<string, string>
  calls: CallRecord[]
}): NonNullable<NonNullable<RunSummary['continuity']>['contextHit']> | null {
  const byChapter: Record<string, { named: number; inPack: number }> = {}
  for (const [chapter, text] of Object.entries(input.chapterTexts)) {
    const check = input.calls
      .filter((c) => c.task === 'continuity-check' && c.step === `ch${chapter}:check` && !c.error)
      .at(-1)
    if (!check) continue
    const startedMs = Date.parse(check.startedAt)
    const cards = input.cards
      .filter((card) => Date.parse(card.createdAt) <= startedMs)
      .map((card) => ({ name: card.name, aliases: card.aliases }))
    const coverage = packCoverage(text, cards, check.prompt)
    byChapter[chapter] = {
      named: coverage.named.length,
      inPack: coverage.named.length - coverage.missing.length,
    }
  }
  const counts = Object.values(byChapter)
  if (counts.length === 0) return null
  const named = counts.reduce((t, c) => t + c.named, 0)
  const inPack = counts.reduce((t, c) => t + c.inPack, 0)
  return {
    chapters: counts.length,
    named,
    inPack,
    rate: named === 0 ? null : inPack / named,
    byChapter,
  }
}

/**
 * Reads a `run-continuity.ts` results file. Tolerant: unknown keys are ignored, optional H fields
 * are dropped when malformed, and a file that does not parse gives null (never throws).
 */
export function parseContinuityResults(json: unknown): ContinuityFixture | null {
  const parsed = z
    .object({
      createdAt: z.string(),
      mode: z.string(),
      model: z.string(),
      expected: z.array(z.unknown()),
      totals: z.object({
        hits: CountSchema,
        misses: z.array(z.unknown()),
        falsePositives: z.array(z.unknown()),
        precision: NullableNumberSchema,
        recall: NullableNumberSchema,
      }),
      trapHits: z.array(z.unknown()).optional().catch(undefined),
      coverage: z
        .object({ named: CountSchema, inPack: CountSchema, rate: z.number() })
        .optional()
        .catch(undefined),
      overBudgetChapters: CountSchema.optional().catch(undefined),
    })
    .safeParse(json)
  if (!parsed.success) return null
  const file = parsed.data
  return ContinuityFixtureSchema.parse({
    createdAt: file.createdAt,
    mode: file.mode,
    model: file.model,
    expected: file.expected.length,
    hits: file.totals.hits,
    misses: file.totals.misses.length,
    falsePositives: file.totals.falsePositives.length,
    precision: file.totals.precision,
    recall: file.totals.recall,
    ...(file.trapHits !== undefined ? { trapHits: file.trapHits.length } : {}),
    ...(file.coverage !== undefined ? { coverage: file.coverage } : {}),
    ...(file.overBudgetChapters !== undefined
      ? { overBudgetChapters: file.overBudgetChapters }
      : {}),
  })
}

// ---- Reading the run dir (never throws on a missing or broken file) ----

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

const SuggestionsFileSchema = z.array(
  z.object({ source: z.string(), quote: z.string(), replacement: z.string(), kind: z.string() }),
)

const ContinueFileSchema = z.object({
  reason: z.string(),
  failure: z.enum(['external-limit', 'external-network', 'model']),
  // One entry per continuation failure of the attempt (stage 1b). Absent in the old single-record shape.
  failures: z
    .array(
      z.object({
        reason: z.string(),
        failure: z.enum(['external-limit', 'external-network', 'model']),
      }),
    )
    .optional(),
})

const ScenesCutFileSchema = z.object({
  failure: z.enum(['external-limit', 'external-network', 'model', 'budget']),
})

const DecisionLineSchema = z.object({
  step: z.string(),
  kind: z.literal('proofread'),
  answer: z.object({
    decisions: z.array(z.object({ id: z.string(), accept: z.boolean() })),
  }),
})

const WikiFinalSchema = z.object({
  entries: z.array(
    z.object({ name: z.string(), aliases: z.array(z.string()), createdAt: z.string() }),
  ),
})

/**
 * The summary inputs of a run dir, from the files the steps wrote. A missing or broken file is
 * skipped, so a partial run still gets the blocks it has. A chapter with suggestions but no
 * decision line yet is skipped (not decided, not 0% accepted).
 */
export function readSummaryInputs(dir: string): SummaryInputs {
  const inputs: SummaryInputs = {}
  const chaptersDir = path.join(dir, 'chapters')
  const names = existsSync(chaptersDir) ? readdirSync(chaptersDir).sort() : []

  const extraction: Record<string, ExtractionCounts> = {}
  const suggestions: Record<string, SuggestionInput[]> = {}
  const chapterTexts: Record<string, string> = {}
  // The chapter text before a scene rewrite, which is the text the continuity check saw.
  const preRewriteTexts: Record<string, string> = {}
  const continueFailures: ContinueFailure[] = []
  const scenesCuts: ScenesCut[] = []
  for (const name of names) {
    const file = path.join(chaptersDir, name)
    let match = /^(\d{2})\.extraction\.json$/.exec(name)
    if (match) {
      const parsed = ExtractionCountsSchema.safeParse(readJsonFile(file))
      if (parsed.success) extraction[String(Number(match[1]))] = parsed.data
      continue
    }
    match = /^(\d{2})\.md$/.exec(name)
    if (match) {
      chapterTexts[String(Number(match[1]))] = readFileSync(file, 'utf8')
      continue
    }
    match = /^(\d{2})\.pre-rewrite\.md$/.exec(name)
    if (match) {
      preRewriteTexts[String(Number(match[1]))] = readFileSync(file, 'utf8')
      continue
    }
    match = /^(\d{2})\.proofread\.json$/.exec(name)
    if (match) {
      const parsed = SuggestionsFileSchema.safeParse(readJsonFile(file))
      if (parsed.success) suggestions[String(Number(match[1]))] = parsed.data
      continue
    }
    match = /^(\d{2})\.attempt-(\d+)\.continue\.json$/.exec(name)
    if (match) {
      const parsed = ContinueFileSchema.safeParse(readJsonFile(file))
      if (parsed.success) {
        const entries = parsed.data.failures?.length ? parsed.data.failures : [parsed.data]
        for (const entry of entries) {
          continueFailures.push({
            chapter: String(Number(match[1])),
            reason: entry.reason,
            failure: entry.failure,
          })
        }
      }
      continue
    }
    match = /^(\d{2})\.attempt-(\d+)\.scenes-cut\.json$/.exec(name)
    if (match) {
      const parsed = ScenesCutFileSchema.safeParse(readJsonFile(file))
      if (parsed.success) {
        scenesCuts.push({ chapter: String(Number(match[1])), failure: parsed.data.failure })
      }
    }
  }
  if (Object.keys(extraction).length > 0) inputs.extraction = extraction
  if (continueFailures.length > 0) inputs.continueFailures = continueFailures
  if (scenesCuts.length > 0) inputs.scenesCuts = scenesCuts

  // The last decision line of each proofread step wins: a redo logs the step again.
  const decisions: Record<string, { id: string; accept: boolean }[]> = {}
  const decisionFile = path.join(dir, 'author-decisions.jsonl')
  if (existsSync(decisionFile)) {
    for (const line of readFileSync(decisionFile, 'utf8').split('\n')) {
      if (line.trim() === '') continue
      const parsed = DecisionLineSchema.safeParse(readLine(line))
      if (!parsed.success) continue
      const chapter = /^ch(\d+):proofread$/.exec(parsed.data.step)?.[1]
      if (chapter === undefined) continue
      decisions[String(Number(chapter))] = parsed.data.answer.decisions
    }
  }
  const proofread: NonNullable<SummaryInputs['proofread']> = {}
  for (const [chapter, list] of Object.entries(suggestions)) {
    const chapterDecisions = decisions[chapter]
    if (chapterDecisions === undefined) continue
    proofread[chapter] = { suggestions: list, decisions: chapterDecisions }
  }
  if (Object.keys(proofread).length > 0) inputs.proofread = proofread

  // Each chapter's context hit is measured on the pre-rewrite text when the scene rewrite ran.
  const contextTexts: Record<string, string> = {}
  for (const chapter of new Set([...Object.keys(chapterTexts), ...Object.keys(preRewriteTexts)])) {
    contextTexts[chapter] = preRewriteTexts[chapter] ?? chapterTexts[chapter] ?? ''
  }
  const wiki = WikiFinalSchema.safeParse(readJsonFile(path.join(dir, 'wiki-final.json')))
  if (wiki.success && Object.keys(contextTexts).length > 0) {
    inputs.contextHit = { cards: wiki.data.entries, chapterTexts: contextTexts }
  }

  const fixture = parseContinuityResults(readJsonFile(path.join(dir, 'continuity-eval.json')))
  if (fixture) inputs.continuityFixture = fixture

  // Planted directives are checked on the saved chapters of a `--directives on` run.
  const config = RunFlagsSchema.safeParse(readJsonFile(path.join(dir, 'config.json')))
  if (config.success && config.data.directives === true) {
    const chapters = Object.entries(chapterTexts).map(([n, text]) => ({ n: Number(n), text }))
    inputs.directives = directiveResults(chapters, config.data.lang)
  }

  // Cost and time use the model's list price (none for local and fake profiles) and the chapter
  // instructions as the author got them.
  const harnessConfig = HarnessFlagsSchema.safeParse(readJsonFile(path.join(dir, 'config.json')))
  if (harnessConfig.success) {
    const flags = harnessConfig.data
    const profile = (MODEL_IDS as readonly string[]).includes(flags.modelId)
      ? MODEL_PROFILES[flags.modelId as ModelId]
      : undefined
    const bible = loadRunBible(dir, flags.lang)
    inputs.harness = {
      chapters: flags.chapters,
      price: profile?.price,
      settings: flags.deploySettings === true ? 'deploy' : 'eval',
      // A chapter the bible does not have gets no instruction text rather than failing the summary.
      instructions: (n) => (bible.chapters[n - 1] ? chapterInstructions(bible, n, flags) : ''),
    }
  }

  return inputs
}

/** The config fields the summary reads. Other fields are ignored. */
const RunFlagsSchema = z.object({
  lang: z.enum(['ko', 'en']),
  directives: z.boolean().optional(),
})

/** The config fields the harness block reads. Old configs have all of them; a partial one gets no block. */
const HarnessFlagsSchema = z.object({
  lang: z.enum(['ko', 'en']),
  modelId: z.string(),
  chapters: z.number().int().positive(),
  deploySettings: z.boolean().optional(),
  fewInstructions: z.boolean().optional(),
  directives: z.boolean().optional(),
  directivesMode: z.literal('ledger').optional(),
})

/** Writes directives.json when the run has directive results (`--directives on`). */
export function writeDirectivesFile(dir: string, inputs: SummaryInputs): void {
  if (!inputs.directives) return
  writeRunFile(dir, 'directives.json', `${JSON.stringify(inputs.directives, null, 2)}\n`)
}

function readLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown
  } catch {
    return undefined
  }
}

// ---- The summary ----

/**
 * The run summary from the call records, the state and the disk inputs. Pure, so `resummarize`
 * can rebuild it from disk without the database. Korean runs report no hangul count: Korean text
 * is the whole prompt. A block is set only when its input was measured.
 */
export function buildRunSummary(
  calls: CallRecord[],
  state: RunState,
  lang: 'ko' | 'en',
  inputs: SummaryInputs = {},
): BuiltRunSummary {
  const byTask: Record<string, { count: number; tokens: number; totalMs: number }> = {}
  for (const call of calls) {
    const row = byTask[call.task] ?? { count: 0, tokens: 0, totalMs: 0 }
    row.count += 1
    row.tokens += (call.usage?.inputTokens ?? 0) + (call.usage?.outputTokens ?? 0)
    row.totalMs += call.durationMs
    byTask[call.task] = row
  }
  const summary: BuiltRunSummary = {
    calls: { total: calls.length, byTask },
    speed: speedSummary(calls),
    wouldTimeOut: calls.filter((call) => call.wouldTimeOut).length,
    contextOverflow: calls.filter((call) => call.contextOverflow).length,
    hangulLeft: lang === 'en' ? calls.reduce((sum, call) => sum + (call.hangulLeft ?? 0), 0) : null,
    failed: state.failed,
    pauses: state.pauses,
    drafts: state.data.drafts,
    focusCounts: state.data.focusCounts,
    interview: interviewMetrics(state.data.interviewTurns ?? []),
    timeouts: timeoutSummary(calls),
  }
  // Only calls that were sampled carry power (local runs), so a run with none has no block.
  const power = powerSummary(calls.flatMap((call) => (call.power ? [call.power] : [])))
  if (power) summary.power = power
  const outputCap = outputCapSummary(calls)
  if (outputCap) summary.outputCap = outputCap
  if (inputs.extraction && Object.keys(inputs.extraction).length > 0) {
    summary.extraction = sumExtraction(inputs.extraction)
  }
  const proofread = inputs.proofread ? proofreadSummary(inputs.proofread) : null
  if (proofread) summary.proofread = proofread

  const contextHit = inputs.contextHit ? contextHitSummary({ ...inputs.contextHit, calls }) : null
  if (contextHit || inputs.continuityFixture) {
    summary.continuity = {
      ...(contextHit ? { contextHit } : {}),
      ...(inputs.continuityFixture ? { fixture: inputs.continuityFixture } : {}),
    }
  }

  if (inputs.directives) {
    summary.directives = { chapters: inputs.directives.chapters.map(directiveCounts) }
  }

  if (inputs.harness) {
    summary.harness = harnessSummary(calls, {
      ...inputs.harness,
      drafts: state.data.drafts,
      plans: state.data.plans,
      // Ledger mode: the planted probe texts count as chapter 1 instruction text. Derived here, so
      // resummarize rebuilds the same number from the state.
      ledgerChars: state.data.planted ? ledgerCharsOf(state.data.planted, lang) : 0,
    })
  }

  const failures = inputs.continueFailures ?? []
  const cuts = inputs.scenesCuts ?? []
  if (failures.length > 0 || cuts.length > 0) {
    const byReason: Record<string, number> = {}
    const byChapter: Record<string, number> = {}
    for (const failure of failures) {
      byReason[failure.reason] = (byReason[failure.reason] ?? 0) + 1
      byChapter[failure.chapter] = (byChapter[failure.chapter] ?? 0) + 1
    }
    summary.draft = {
      continueFailed: {
        total: failures.length,
        external: failures.filter((f) => f.failure !== 'model').length,
        byReason,
        byChapter,
      },
    }
    if (cuts.length > 0) {
      const byFailure: Record<string, number> = {}
      const cutByChapter: Record<string, number> = {}
      for (const cut of cuts) {
        byFailure[cut.failure] = (byFailure[cut.failure] ?? 0) + 1
        cutByChapter[cut.chapter] = (cutByChapter[cut.chapter] ?? 0) + 1
      }
      summary.draft.scenesCut = {
        total: cuts.length,
        // A budget cut is not an external failure: no call failed.
        external: cuts.filter(
          (c) => c.failure === 'external-limit' || c.failure === 'external-network',
        ).length,
        byFailure,
        byChapter: cutByChapter,
      }
    }
  }
  return summary
}

export const finish: StepFn = async (ctx, _key, state) => {
  const workId = requireWorkId(state)
  const entries = await listEntries(ctx.db, ctx.actor, workId)
  const facts = await listFacts(ctx.db, ctx.actor, workId)
  const threads = await listThreads(ctx.db, ctx.actor, workId)
  const relations = await listRelations(ctx.db, ctx.actor, workId)
  const namingRules = await listNamingRules(ctx.db, ctx.actor, workId)
  const styleCards = await listStyleCards(ctx.db, ctx.actor, workId)

  writeRunFile(
    ctx.dir,
    'wiki-final.json',
    `${JSON.stringify(
      {
        entries: entries.map((entry) => ({
          ...entry,
          facts: facts.filter((fact) => fact.entryId === entry.id),
        })),
        threads,
        relations,
        namingRules,
        styleCards,
      },
      null,
      2,
    )}\n`,
  )

  const calls = readCallRecords(ctx.dir)
  const inputs = readSummaryInputs(ctx.dir)
  // Ledger mode: the planted rows go to directives.json (the harness block reads them from the state).
  if (state.data.planted && inputs.directives) inputs.directives.planted = state.data.planted
  writeDirectivesFile(ctx.dir, inputs)
  writeRunFile(
    ctx.dir,
    'run-summary.json',
    `${JSON.stringify(buildRunSummary(calls, state, ctx.config.lang, inputs), null, 2)}\n`,
  )
  return 'done'
}
