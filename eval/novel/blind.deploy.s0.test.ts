import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { blindCallRecord } from './blind'

// The blinded call record never carries the effort rule (stage 0), since it names the settings mode.

describe('blindCallRecord deploy settings', () => {
  it('drops effortRule from the copy', () => {
    const call = {
      seq: 1,
      task: 'proofread',
      step: null,
      kind: 'object',
      model: 'claude-haiku-5-5',
      effortRule: 'task',
      effortRequested: 'medium',
      maxTokens: 4000,
      maxTokensRule: 'product',
      output: { ok: true },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as unknown as CallRecord
    expect(blindCallRecord(call)).not.toHaveProperty('effortRule')
  })
})
