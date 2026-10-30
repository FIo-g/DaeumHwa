import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { BLIND_LABEL, blindCallRecord } from './blind'

// Review fixes for the blinded call record (thinkRequested). Kept apart from blind.test.ts.

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

describe('thinkRequested blinding', () => {
  it.each([
    ['high', 'high'],
    ['true', true],
    ['false', false],
    ['null', null],
  ])('drops thinkRequested when the value is %s', (_label, think) => {
    const input = callRecord({ thinkRequested: think as CallRecord['thinkRequested'] })
    const before = JSON.stringify(input)
    const blinded = blindCallRecord(input)

    expect(blinded).not.toHaveProperty('thinkRequested')
    expect(blinded.model).toBe(BLIND_LABEL)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('keeps the timing fields queueMs and waitInclusiveMs', () => {
    const blinded = blindCallRecord(
      callRecord({ thinkRequested: 'high', queueMs: 120, waitInclusiveMs: 125 }),
    )

    expect(blinded.queueMs).toBe(120)
    expect(blinded.waitInclusiveMs).toBe(125)
    expect(blinded.durationMs).toBe(5)
  })
})
