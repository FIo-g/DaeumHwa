import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { blindCallRecord } from './blind'

// Blinding of the task-limit fields (track M4). Kept apart from blind.review.test.ts.

function callRecord(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    seq: 1,
    task: 'chapter-extract',
    step: 'ch1:draft',
    kind: 'object',
    startedAt: '2026-10-19T00:00:00.000Z',
    durationMs: 5,
    firstTokenMs: null,
    speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
    model: 'claude-haiku-5-5',
    effortRequested: 'high',
    maxTokens: 32000,
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

describe('task limit blinding', () => {
  it('keeps the task values and still drops the sent values', () => {
    const input = callRecord({ taskEffort: 'low', taskMaxTokens: 16000, maxTokensRule: 'product' })
    const before = JSON.stringify(input)
    const blinded = blindCallRecord(input)

    expect(blinded.taskEffort).toBe('low')
    expect(blinded.taskMaxTokens).toBe(16000)
    expect(blinded.maxTokensRule).toBe('product')
    expect(blinded).not.toHaveProperty('effortRequested')
    expect(blinded).not.toHaveProperty('maxTokens')
    expect(JSON.stringify(input)).toBe(before)
  })
})
