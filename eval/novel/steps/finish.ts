import { listFacts } from '@/server/facts'
import { listNamingRules } from '@/server/naming'
import { listRelations } from '@/server/relations'
import { listStyleCards } from '@/server/styles'
import { listThreads } from '@/server/threads'
import { listEntries } from '@/server/wiki'
import type { CallRecord, CallSpeed } from '../eval-client'
import { interviewMetrics } from '../metrics-interview'
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
  // so calls that overlap (continuity and extract run in parallel) count once, and the gaps between
  // them (the author's wait) count zero. The model time is the plain sum of the call durations.
  const chapterIntervals: Record<string, [number, number][]> = {}
  const perChapterModelMs: Record<string, number> = {}
  for (const call of calls) {
    const chapter = /^ch(\d+):/.exec(call.step ?? '')?.[1]
    if (chapter === undefined) continue
    perChapterModelMs[chapter] = (perChapterModelMs[chapter] ?? 0) + call.durationMs
    const start = Date.parse(call.startedAt)
    chapterIntervals[chapter] ??= []
    if (Number.isFinite(start)) chapterIntervals[chapter].push([start, start + call.durationMs])
  }
  const perChapterMs: Record<string, number> = {}
  for (const [chapter, intervals] of Object.entries(chapterIntervals)) {
    perChapterMs[chapter] = mergedMs(intervals)
  }

  return {
    byTask,
    overall: {
      ...medians(calls),
      source: calls.some((c) => recordSpeed(c).source === 'ollama') ? 'ollama' : 'wall',
    },
    perChapterMs,
    perChapterModelMs,
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

/**
 * The run summary from the call records and the state. Pure, so `resummarize` can rebuild it from
 * disk without the database. Korean runs report no hangul count: Korean text is the whole prompt.
 */
export function buildRunSummary(calls: CallRecord[], state: RunState, lang: 'ko' | 'en') {
  const byTask: Record<string, { count: number; tokens: number; totalMs: number }> = {}
  for (const call of calls) {
    const row = byTask[call.task] ?? { count: 0, tokens: 0, totalMs: 0 }
    row.count += 1
    row.tokens += (call.usage?.inputTokens ?? 0) + (call.usage?.outputTokens ?? 0)
    row.totalMs += call.durationMs
    byTask[call.task] = row
  }
  return {
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
  }
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
  writeRunFile(
    ctx.dir,
    'run-summary.json',
    `${JSON.stringify(buildRunSummary(calls, state, ctx.config.lang), null, 2)}\n`,
  )
  return 'done'
}
