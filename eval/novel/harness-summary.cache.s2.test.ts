import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { harnessSummary } from './harness-summary'

// Cache share and ledger characters of the harness block (stage 2, task 8). Old runs read as 0.

/** A call record with only the fields the harness reads. */
function call(seq: number, step: string | null, task: string, usage: object) {
  return {
    seq,
    task,
    step,
    kind: 'object',
    durationMs: 1000,
    firstTokenMs: null,
    usage,
  } as unknown as CallRecord
}

const base = { drafts: {}, instructions: () => '', settings: 'eval' as const }

describe('cacheReadShare', () => {
  it('is the cached input tokens over all input tokens of the chapter', () => {
    const summary = harnessSummary(
      [
        call(1, 'ch1:draft', 'draft-chapter', {
          inputTokens: 300,
          outputTokens: 10,
          cacheReadTokens: 100,
        }),
        call(2, 'ch1:proofread', 'proofread', {
          inputTokens: 100,
          outputTokens: 5,
          cacheReadTokens: 0,
        }),
      ],
      { ...base, chapters: 1 },
    )
    expect(summary.chapters[0]?.cacheReadShare).toBe(0.25)
    expect(summary.total.cacheReadShare).toBe(0.25)
  })

  it('is 0 when a chapter has no calls', () => {
    const summary = harnessSummary([], { ...base, chapters: 1 })
    expect(summary.chapters[0]?.cacheReadShare).toBe(0)
    expect(summary.total.cacheReadShare).toBe(0)
  })
})

describe('ledgerChars', () => {
  it('counts the planted characters on chapter 1 and the total only', () => {
    const summary = harnessSummary(
      [call(1, 'ch1:draft', 'draft-chapter', { inputTokens: 1, outputTokens: 1 })],
      {
        ...base,
        chapters: 2,
        ledgerChars: 123,
      },
    )
    expect(summary.chapters[0]?.ledgerChars).toBe(123)
    expect(summary.chapters[1]?.ledgerChars).toBe(0)
    expect(summary.total.ledgerChars).toBe(123)
  })

  it('is 0 when no ledger characters are given (older runs)', () => {
    const summary = harnessSummary([], { ...base, chapters: 1 })
    expect(summary.chapters[0]?.ledgerChars).toBe(0)
    expect(summary.total.ledgerChars).toBe(0)
  })
})
