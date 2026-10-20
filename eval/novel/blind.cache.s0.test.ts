import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { blindCallRecord } from './blind'

// Cache token keys depend on the provider, so the blinded call record keeps only the input and output counts.

function callWithUsage(usage: unknown): CallRecord {
  return {
    seq: 1,
    task: 'proofread',
    step: null,
    kind: 'object',
    model: 'claude-haiku-5-5',
    output: { ok: true },
    usage,
  } as unknown as CallRecord
}

describe('blindCallRecord usage', () => {
  it('keeps only inputTokens and outputTokens, so the provider cache keys do not show', () => {
    const anthropic = callWithUsage({
      inputTokens: 5000,
      outputTokens: 900,
      cacheReadTokens: 0,
      cacheWriteTokens: 1834,
    })
    const responses = callWithUsage({ inputTokens: 5000, outputTokens: 900, cacheReadTokens: 0 })
    const local = callWithUsage({ inputTokens: 5000, outputTokens: 900 })

    const blinded = [anthropic, responses, local].map((call) => blindCallRecord(call).usage)
    for (const usage of blinded) {
      expect(usage).toEqual({ inputTokens: 5000, outputTokens: 900 })
    }
    const keys = blinded.map((usage) => Object.keys(usage ?? {}))
    expect(keys[1]).toEqual(keys[0])
    expect(keys[2]).toEqual(keys[0])
  })

  it('keeps usage null as null', () => {
    expect(blindCallRecord(callWithUsage(null)).usage).toBeNull()
  })

  it('does not change the input record', () => {
    const call = callWithUsage({
      inputTokens: 5000,
      outputTokens: 900,
      cacheReadTokens: 0,
      cacheWriteTokens: 1834,
    })
    blindCallRecord(call)
    expect(call.usage).toEqual({
      inputTokens: 5000,
      outputTokens: 900,
      cacheReadTokens: 0,
      cacheWriteTokens: 1834,
    })
  })
})
