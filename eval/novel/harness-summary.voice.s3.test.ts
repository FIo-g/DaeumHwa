import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { harnessSummary } from './harness-summary'

// Stage 3 M3 finding F7: `voiceFixes` counts applied lines, `voiceProposed` keeps the
// lines the voice-fix call proposed.
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

describe('voice fixes of the harness (F7)', () => {
  it('counts applied lines as voiceFixes and proposed lines as voiceProposed', () => {
    const records = [
      call(1, 'draft-chapter', { kind: 'stream', durationMs: 20000, firstTokenMs: 1200 }),
      call(2, 'voice-fix', {
        output: { lines: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      }),
    ]
    const summary = harnessSummary(records, { ...base, voiceApplied: { 1: 2 } })
    expect(summary.chapters[0]).toMatchObject({ voiceFixes: 2, voiceProposed: 3 })
  })

  it('gives voiceFixes 0 without applied lines and keeps the proposed count', () => {
    const records = [
      call(1, 'draft-chapter', { kind: 'stream', durationMs: 20000, firstTokenMs: 1200 }),
      call(2, 'voice-fix', {
        output: { lines: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      }),
    ]
    const summary = harnessSummary(records, base)
    expect(summary.chapters[0]).toMatchObject({ voiceFixes: 0, voiceProposed: 3 })
  })
})
