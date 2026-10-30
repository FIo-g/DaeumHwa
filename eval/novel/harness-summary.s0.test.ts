import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { MODEL_PROFILES, type ModelPrice } from './models'
import { callCostUsd, harnessSummary } from './harness-summary'

// Chapter cost, time and intervention block (stage 0). Costs use the Haiku price table; times are
// the design's definitions (section 6.6).

const HAIKU_PRICE = MODEL_PROFILES['haiku-5.5'].price as ModelPrice

/** A call record with only the fields the harness reads. */
function call(seq: number, step: string | null, task: string, o: Partial<CallRecord> = {}) {
  return {
    seq,
    task,
    step,
    kind: 'object',
    durationMs: 1000,
    firstTokenMs: null,
    usage: { inputTokens: 100, outputTokens: 10 },
    ...o,
  } as unknown as CallRecord
}

const CHAPTER_CALLS: CallRecord[] = [
  call(1, 'ch1:draft', 'draft-beats', { durationMs: 3000 }),
  call(2, 'ch1:draft', 'draft-chapter', {
    kind: 'stream',
    durationMs: 20000,
    firstTokenMs: 1200,
  }),
  call(3, 'ch1:draft', 'draft-continue', { kind: 'stream', durationMs: 8000 }),
  call(4, 'ch1:proofread', 'proofread', { durationMs: 5000 }),
]

describe('callCostUsd', () => {
  it('prices uncached input, cache reads and writes, and output separately', () => {
    const usage = {
      inputTokens: 10000,
      outputTokens: 2000,
      cacheReadTokens: 4000,
      cacheWriteTokens: 1000,
    }
    expect(callCostUsd(usage, HAIKU_PRICE)).toBeCloseTo(0.001665, 9)
  })
})

describe('harnessSummary', () => {
  const base = {
    chapters: 1,
    drafts: { 1: [] },
    instructions: () => '지시',
    price: HAIKU_PRICE,
    settings: 'eval' as const,
  }

  it('splits a chapter into write and after-save time and finds the first character', () => {
    const summary = harnessSummary(CHAPTER_CALLS, base)
    const chapter = summary.chapters[0]
    expect(chapter?.firstCharMs).toBe(4200)
    expect(chapter?.writeMs).toBe(31000)
    expect(chapter?.afterSaveMs).toBe(5000)
    expect(chapter?.totalMs).toBe(36000)
    expect(chapter?.calls).toBe(4)
  })

  it('counts first character from the stream when there are no beats', () => {
    const summary = harnessSummary(CHAPTER_CALLS.slice(1), base)
    expect(summary.chapters[0]?.firstCharMs).toBe(1200)
  })

  it('does not count the stage 1 plan call before the stream', () => {
    const withPlan = [
      call(0, 'ch1:draft', 'draft-plan', { durationMs: 2500 }),
      ...CHAPTER_CALLS.slice(1),
    ]
    const summary = harnessSummary(withPlan, base)
    expect(summary.chapters[0]?.firstCharMs).toBe(1200)
  })

  it('marks a block whose calls did not record cache tokens', () => {
    const summary = harnessSummary(CHAPTER_CALLS, base)
    expect(summary.chapters[0]?.cacheRecorded).toBe(false)
    expect(summary.interview.cacheRecorded).toBe(false)
  })

  it('marks a block whose calls recorded a cache key, even at zero', () => {
    const records = [
      call(1, 'ch1:draft', 'draft-chapter', {
        usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0 },
      }),
      call(2, 'interview', 'interview-question', {
        usage: { inputTokens: 100, outputTokens: 10, cacheWriteTokens: 0 },
      }),
    ]
    const summary = harnessSummary(records, base)
    expect(summary.chapters[0]?.cacheRecorded).toBe(true)
    expect(summary.interview.cacheRecorded).toBe(true)
  })

  it('counts one regeneration for two draft attempts', () => {
    const summary = harnessSummary(CHAPTER_CALLS, {
      ...base,
      drafts: {
        1: [
          { runId: 'a', usable: false, quality: null, reason: 'short' },
          { runId: 'b', usable: true, quality: 4, reason: 'ok' },
        ],
      },
    })
    expect(summary.chapters[0]?.regenerations).toBe(1)
  })

  it('counts instruction characters by code point', () => {
    const summary = harnessSummary(CHAPTER_CALLS, { ...base, instructions: () => '가나다' })
    expect(summary.chapters[0]?.instructionChars).toBe(3)
  })

  it('reports null cost and no price source without a price', () => {
    const summary = harnessSummary(CHAPTER_CALLS, { ...base, price: undefined })
    expect(summary.priceSource).toBeNull()
    expect(summary.chapters[0]?.usd).toBeNull()
    expect(summary.total.usd).toBeNull()
  })

  it('sums interview and total calls, and carries the settings mode', () => {
    const records = [
      ...CHAPTER_CALLS,
      call(5, 'interview', 'interview-question', { durationMs: 700 }),
    ]
    const summary = harnessSummary(records, { ...base, settings: 'deploy' })
    expect(summary.settings).toBe('deploy')
    expect(summary.interview.calls).toBe(1)
    expect(summary.interview.totalMs).toBe(700)
    expect(summary.total.calls).toBe(5)
    expect(summary.total.totalMs).toBe(36700)
  })
})
