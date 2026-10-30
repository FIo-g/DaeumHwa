import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { harnessSummary } from './harness-summary'

// Check fields of the chapter harness (stage 3, task 6): picked scenes, applied fixes and the
// check time. The check calls belong to the draft step, so their time also counts in writeMs.

/** A call record with only the fields the harness reads. */
function call(seq: number, task: string, o: Partial<CallRecord> = {}) {
  return {
    seq,
    task,
    step: 'ch1:draft',
    kind: 'object',
    durationMs: 1000,
    firstTokenMs: null,
    usage: { inputTokens: 100, outputTokens: 10 },
    ...o,
  } as unknown as CallRecord
}

const base = { chapters: 1, drafts: {}, instructions: () => '', settings: 'eval' as const }

describe('check fields of the harness', () => {
  it('counts flagged scenes, applied fixes and the check time in writeMs', () => {
    const records = [
      call(1, 'draft-chapter', { kind: 'stream', durationMs: 20000, firstTokenMs: 1200 }),
      call(2, 'draft-check', {
        durationMs: 1500,
        output: { scenes: [{ scene: 1 }, { scene: 2 }] },
      }),
      call(3, 'scene-fix', { durationMs: 2500 }),
      call(4, 'scene-fix', { durationMs: 3000 }),
    ]
    const summary = harnessSummary(records, base)
    expect(summary.chapters[0]).toMatchObject({
      checkFlagged: 2,
      sceneFixes: 2,
      checkMs: 7000,
      writeMs: 27000,
    })
  })

  it('gives zero check fields for older runs without check calls', () => {
    const summary = harnessSummary(
      [call(1, 'draft-chapter', { kind: 'stream', durationMs: 20000 })],
      base,
    )
    expect(summary.chapters[0]).toMatchObject({ checkFlagged: 0, sceneFixes: 0, checkMs: 0 })
  })
})
