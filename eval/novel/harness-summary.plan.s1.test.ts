import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { harnessSummary } from './harness-summary'

// Plan fields of the chapter harness (stage 1): plan call time, plan edits and note length.

/** A call record with only the fields the harness reads. */
function call(seq: number, step: string, task: string, o: Partial<CallRecord> = {}) {
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

const PLAN_CALLS: CallRecord[] = [
  call(1, 'ch1:draft', 'draft-plan', { durationMs: 4000 }),
  call(2, 'ch1:draft', 'draft-chapter', { kind: 'stream', durationMs: 20000, firstTokenMs: 1200 }),
]

const base = {
  chapters: 1,
  drafts: {},
  instructions: () => '',
  settings: 'eval' as const,
}

describe('plan fields of the harness', () => {
  it('sums the plan call time and counts the plan edits and their characters', () => {
    const summary = harnessSummary(PLAN_CALLS, {
      ...base,
      plans: { 1: { notes: ['가'.repeat(17)] } },
    })
    expect(summary.chapters[0]).toMatchObject({ planMs: 4000, planEdits: 1, planEditChars: 17 })
  })

  it('gives zero plan fields for a quick run with no plan', () => {
    const summary = harnessSummary(
      [call(1, 'ch1:draft', 'draft-chapter', { kind: 'stream', durationMs: 20000 })],
      base,
    )
    expect(summary.chapters[0]).toMatchObject({ planMs: 0, planEdits: 0, planEditChars: 0 })
  })
})
