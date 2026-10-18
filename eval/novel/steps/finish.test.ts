import { describe, expect, it } from 'vitest'
import type { CallRecord } from '../eval-client'
import { speedSummary } from './finish'

/** An ISO start time the given number of ms after a fixed origin. */
function at(ms: number): string {
  return new Date(Date.UTC(2026, 9, 18, 0, 0, 0) + ms).toISOString()
}

// Only the fields speedSummary reads are set; the rest is cast away.
function call(fields: Partial<CallRecord>): CallRecord {
  return {
    task: 'draft-chapter',
    step: null,
    startedAt: at(0),
    durationMs: 0,
    firstTokenMs: null,
    speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
    ...fields,
  } as CallRecord
}

describe('speedSummary', () => {
  it('takes the median of an even count as the mean of the middle two', () => {
    const rates = [10, 20, 30, 40].map((outputTokensPerSec) =>
      call({ speed: { outputTokensPerSec, promptTokensPerSec: null, source: 'wall' } }),
    )
    expect(speedSummary(rates).byTask['draft-chapter']?.medianOutputTokensPerSec).toBe(25)
    expect(speedSummary(rates).overall.medianOutputTokensPerSec).toBe(25)
  })

  it('takes the middle value of an odd count', () => {
    const rates = [10, 90, 20].map((outputTokensPerSec) =>
      call({ speed: { outputTokensPerSec, promptTokensPerSec: null, source: 'wall' } }),
    )
    expect(speedSummary(rates).overall.medianOutputTokensPerSec).toBe(20)
  })

  it('ignores nulls and returns null when no value is left', () => {
    const mixed = [null, 10, 30].map((outputTokensPerSec) =>
      call({ speed: { outputTokensPerSec, promptTokensPerSec: null, source: 'wall' } }),
    )
    expect(speedSummary(mixed).overall.medianOutputTokensPerSec).toBe(20)

    const none = [null, null].map((outputTokensPerSec) =>
      call({ speed: { outputTokensPerSec, promptTokensPerSec: null, source: 'wall' } }),
    )
    expect(speedSummary(none).overall.medianOutputTokensPerSec).toBeNull()
    expect(speedSummary([]).overall.medianOutputTokensPerSec).toBeNull()
  })

  it('takes the median first-token time per task over stream calls only', () => {
    const summary = speedSummary([
      call({ firstTokenMs: 1000 }),
      call({ firstTokenMs: 3000 }),
      call({ firstTokenMs: null }),
      call({ task: 'proofread', firstTokenMs: null }),
    ])
    const draft = summary.byTask['draft-chapter']
    expect(draft).toMatchObject({ calls: 3, medianFirstTokenMs: 2000 })
    expect(summary.byTask.proofread).toMatchObject({ calls: 1, medianFirstTokenMs: null })
  })

  it('reports ollama as the overall source when any call used Ollama timings', () => {
    const wall = call({})
    const ollama = call({
      speed: { outputTokensPerSec: 30, promptTokensPerSec: 500, source: 'ollama' },
    })
    expect(speedSummary([wall]).overall.source).toBe('wall')
    expect(speedSummary([wall, ollama]).overall.source).toBe('ollama')
  })

  it('takes the wall time of a chapter from overlapping calls once, not summed', () => {
    // continuity and extract run in parallel: 0-1000 ms and 100-1100 ms.
    const summary = speedSummary([
      call({ step: 'ch1:continuity', startedAt: at(0), durationMs: 1000 }),
      call({ step: 'ch1:check', startedAt: at(100), durationMs: 1000 }),
    ])
    expect(summary.perChapterMs).toEqual({ '1': 1100 })
    expect(summary.perChapterModelMs).toEqual({ '1': 2000 })
  })

  it("leaves out the gaps between a chapter's calls (author waits) from its wall time", () => {
    // draft at 0-500 ms, the author answers, proofread at 10000-10400 ms.
    const summary = speedSummary([
      call({ step: 'ch1:draft', startedAt: at(0), durationMs: 500 }),
      call({ step: 'ch1:proofread', startedAt: at(10_000), durationMs: 400 }),
    ])
    expect(summary.perChapterMs).toEqual({ '1': 900 })
    expect(summary.perChapterModelMs).toEqual({ '1': 900 })
  })

  it('takes call time per chapter from the step keys and skips other steps', () => {
    const summary = speedSummary([
      call({ step: 'ch1:draft', startedAt: at(0), durationMs: 100 }),
      call({ step: 'ch1:check', startedAt: at(1000), durationMs: 200 }),
      call({ step: 'ch2:check', startedAt: at(2000), durationMs: 50 }),
      call({ step: 'style:suggest', startedAt: at(3000), durationMs: 999 }),
      call({ step: null, startedAt: at(4000), durationMs: 999 }),
    ])
    expect(summary.perChapterMs).toEqual({ '1': 300, '2': 50 })
    expect(summary.perChapterModelMs).toEqual({ '1': 300, '2': 50 })
  })

  it('treats records without a speed block as null speed', () => {
    const legacy = { task: 'draft-chapter', durationMs: 10 } as unknown as CallRecord
    const summary = speedSummary([
      legacy,
      call({ speed: { outputTokensPerSec: 40, promptTokensPerSec: null, source: 'wall' } }),
    ])
    expect(summary.byTask['draft-chapter']?.calls).toBe(2)
    expect(summary.overall.medianOutputTokensPerSec).toBe(40)
  })
})
