import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { blindCallRecord } from './blind'

// The retry budget of a changed call is a fingerprint of the local profile, so the blinded call
// drops it like thinkRequested (P9).

function callRecord(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    seq: 1,
    task: 'proofread',
    step: 'ch1:proofread',
    kind: 'object',
    startedAt: '2026-10-19T00:00:00.000Z',
    durationMs: 5,
    firstTokenMs: null,
    speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
    model: 'qwen3.8:27b-mlx',
    effortRequested: 'high',
    maxTokens: 48000,
    productTimeoutMs: 900_000,
    wouldTimeOut: false,
    system: '',
    prompt: '',
    output: null,
    usage: null,
    hangulLeft: 0,
    contextOverflow: false,
    error: null,
    ...overrides,
  }
}

describe('retryBudget blinding', () => {
  it('drops retryBudget from the blinded call', () => {
    const input = callRecord({
      retryBudget: { reason: 'format', maxTokens: null, think: false },
    })
    const before = JSON.stringify(input)

    const blinded = blindCallRecord(input)

    expect('retryBudget' in blinded).toBe(false)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('leaves the rest of the blinded record as it was without the field', () => {
    const plain = blindCallRecord(callRecord())
    const budgeted = blindCallRecord(
      callRecord({ retryBudget: { reason: 'max-tokens', maxTokens: 48000, think: null } }),
    )

    expect(budgeted).toEqual(plain)
  })
})
