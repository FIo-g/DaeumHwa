import { describe, expect, it } from 'vitest'
import type { CallRecord } from '../eval-client'
import { speedSummary, timeoutSummary } from './finish'

// Lane wait tests for the run summary (track F4). Kept apart from finish.test.ts (spec 5).

/** An ISO start time the given number of ms after a fixed origin. */
function at(ms: number): string {
  return new Date(Date.UTC(2026, 9, 18, 0, 0, 0) + ms).toISOString()
}

// Only the fields the summaries read are set; the rest is cast away.
function call(fields: Partial<CallRecord>): CallRecord {
  return {
    task: 'continuity-check',
    step: 'ch1:check',
    startedAt: at(0),
    durationMs: 0,
    firstTokenMs: null,
    speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
    ...fields,
  } as CallRecord
}

describe('speedSummary queue wait', () => {
  it('perChapterMs counts the queue wait', () => {
    // The second call was requested at 0 and waited 100 ms for the lane, so it started at 100.
    const calls = [
      call({ startedAt: at(0), durationMs: 100, queueMs: 0 }),
      call({ startedAt: at(100), durationMs: 40, queueMs: 100, task: 'chapter-extract' }),
    ]
    const summary = speedSummary(calls)
    expect(summary.perChapterMs).toEqual({ '1': 140 })
    expect(summary.perChapterModelMs).toEqual({ '1': 140 })
  })
})

describe('timeoutSummary queue wait', () => {
  it('timeoutSummary uses true call time', () => {
    const summary = timeoutSummary([call({ durationMs: 100, queueMs: 200, productTimeoutMs: 250 })])
    expect(summary.total).toBe(0)
    expect(summary.byTask).toEqual({})
  })
})
