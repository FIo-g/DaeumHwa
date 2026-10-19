import { describe, expect, it } from 'vitest'
import type { CallRecord } from '../eval-client'
import type { PowerInfo } from '../power'
import { type RunConfig, newState } from '../state'
import { RunSummarySchema, buildRunSummary } from './finish'

// Power block of the run summary (track M1). Copies `at` and `call` from finish.F4.test.ts.

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

const LOW: PowerInfo = { source: 'ac', mode: 'low', modeRaw: 'powermode 1' }
const HIGH: PowerInfo = { source: 'ac', mode: 'high', modeRaw: 'powermode 2' }

const config: RunConfig = {
  runId: 'r',
  modelId: 'qwen3.8-27b',
  lang: 'ko',
  chapters: 1,
  questions: 1,
  maxDraftAttempts: 3,
  createdAt: '2026-10-18T00:00:00.000Z',
  commit: 'test',
}

describe('buildRunSummary power block', () => {
  it('adds the power block', () => {
    const calls = [
      call({ power: LOW }),
      call({ power: HIGH, startedAt: at(1) }),
      call({ power: LOW, startedAt: at(2) }),
    ]
    const summary = buildRunSummary(calls, newState(config), 'ko')
    expect(summary.power).toEqual({
      sampled: 3,
      lowPower: 2,
      onBattery: 0,
      byMode: { low: 2, high: 1 },
      bySource: { ac: 3 },
    })
    const parsed = RunSummarySchema.parse(JSON.parse(JSON.stringify(summary)))
    expect(parsed.power).toEqual(summary.power)
  })

  it('no sample, no block', () => {
    const summary = buildRunSummary([call({}), call({ startedAt: at(1) })], newState(config), 'ko')
    expect(summary).not.toHaveProperty('power')
    expect(() => RunSummarySchema.parse(JSON.parse(JSON.stringify(summary)))).not.toThrow()
  })

  it('partial samples count only the sampled calls', () => {
    const calls = [call({ power: LOW }), call({ startedAt: at(1) }), call({ startedAt: at(2) })]
    const summary = buildRunSummary(calls, newState(config), 'ko')
    expect(summary.power?.sampled).toBe(1)
    expect(summary.calls.total).toBe(3)
  })
})
