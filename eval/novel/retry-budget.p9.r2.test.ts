import { describe, expect, it } from 'vitest'
import { FORMAT_MESSAGE, MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import { AI_TIMEOUT_MESSAGE } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { MODEL_PROFILES } from './models'
import {
  planRetry,
  RETRY_MAX_TOKENS_FACTOR,
  RETRY_POLICY,
  type RetryHint,
  retryReasonOf,
  widenedMaxTokens,
} from './retry-budget'

const QWEN = MODEL_PROFILES['qwen3.8-27b']
const GPT_OSS = MODEL_PROFILES['gpt-oss-20b']
const EXAONE = MODEL_PROFILES['exaone3.5-32b']

function hint(task: AiTaskName, reason: RetryHint['reason'], contextOverflow = false): RetryHint {
  return { task, reason, contextOverflow }
}

describe('retryReasonOf', () => {
  it('is exact', () => {
    expect(retryReasonOf(MAX_TOKENS_MESSAGE)).toBe('max-tokens')
    expect(retryReasonOf(FORMAT_MESSAGE)).toBe('format')
    expect(retryReasonOf(AI_TIMEOUT_MESSAGE)).toBeNull()
    expect(retryReasonOf('취소했습니다.')).toBeNull()
    expect(retryReasonOf('')).toBeNull()
    expect(retryReasonOf(`${MAX_TOKENS_MESSAGE} (x)`)).toBeNull()
  })
})

describe('RETRY_POLICY', () => {
  it('widens only a cut-off call and lowers think on both reasons', () => {
    expect(RETRY_POLICY['max-tokens']).toEqual({ widen: true, lowerThink: true })
    expect(RETRY_POLICY.format).toEqual({ widen: false, lowerThink: true })
    expect(RETRY_MAX_TOKENS_FACTOR).toBe(1.5)
  })
})

describe('widenedMaxTokens', () => {
  it('widens by 1.5 and stops at half of numCtx', () => {
    expect(widenedMaxTokens(32000, 262144)).toBe(48000)
    expect(widenedMaxTokens(32000, 131072)).toBe(48000)
    expect(widenedMaxTokens(8192, 32768)).toBe(12288)
    expect(widenedMaxTokens(8191, 32768)).toBe(12287)
  })

  it('returns null when the ceiling does not allow a wider cap', () => {
    expect(widenedMaxTokens(32000, 40000)).toBeNull()
    expect(widenedMaxTokens(10000, 20000)).toBeNull()
    expect(widenedMaxTokens(32000, undefined)).toBeNull()
  })
})

describe('planRetry', () => {
  it('changes a cut-off helper on qwen: wider cap and think off', () => {
    expect(
      planRetry({
        hint: hint('proofread', 'max-tokens'),
        profile: QWEN,
        baseMaxTokens: 32000,
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toEqual({ reason: 'max-tokens', maxTokens: 48000, think: false })
  })

  it('lowers think only after a format failure', () => {
    expect(
      planRetry({
        hint: hint('proofread', 'format'),
        profile: QWEN,
        baseMaxTokens: 32000,
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toEqual({ reason: 'format', maxTokens: null, think: false })
  })

  it('keeps think on a prose task', () => {
    expect(
      planRetry({
        hint: hint('draft-chapter', 'max-tokens'),
        profile: QWEN,
        baseMaxTokens: 32000,
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toEqual({ reason: 'max-tokens', maxTokens: 48000, think: null })
    expect(
      planRetry({
        hint: hint('scene-rewrite', 'format'),
        profile: QWEN,
        baseMaxTokens: 32000,
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toBeNull()
  })

  it('without a retry client only widens', () => {
    expect(
      planRetry({
        hint: hint('proofread', 'format'),
        profile: QWEN,
        baseMaxTokens: 32000,
        hasRetryClient: false,
        productLimits: false,
      }),
    ).toBeNull()
    expect(
      planRetry({
        hint: hint('proofread', 'max-tokens'),
        profile: QWEN,
        baseMaxTokens: 32000,
        hasRetryClient: false,
        productLimits: false,
      }),
    ).toEqual({ reason: 'max-tokens', maxTokens: 48000, think: null })
  })

  it('does not widen after a context overflow', () => {
    expect(
      planRetry({
        hint: hint('proofread', 'max-tokens', true),
        profile: QWEN,
        baseMaxTokens: 32000,
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toEqual({ reason: 'max-tokens', maxTokens: null, think: false })
    expect(
      planRetry({
        hint: hint('draft-chapter', 'max-tokens', true),
        profile: QWEN,
        baseMaxTokens: 32000,
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toBeNull()
  })

  it('handles gpt-oss and exaone', () => {
    expect(
      planRetry({
        hint: hint('proofread', 'format'),
        profile: GPT_OSS,
        baseMaxTokens: 32000,
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toEqual({ reason: 'format', maxTokens: null, think: 'medium' })
    expect(
      planRetry({
        hint: hint('proofread', 'format'),
        profile: GPT_OSS,
        baseMaxTokens: 32000,
        helperThink: 'low',
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toBeNull()
    expect(
      planRetry({
        hint: hint('proofread', 'max-tokens'),
        profile: EXAONE,
        baseMaxTokens: 8192,
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toEqual({ reason: 'max-tokens', maxTokens: 12288, think: null })
    expect(
      planRetry({
        hint: hint('proofread', 'format'),
        profile: EXAONE,
        baseMaxTokens: 8192,
        hasRetryClient: true,
        productLimits: false,
      }),
    ).toBeNull()
  })

  it('never changes cloud, fake or product-limits runs', () => {
    for (const id of ['haiku-5.5', 'luna-6', 'fake'] as const) {
      for (const reason of ['max-tokens', 'format'] as const) {
        expect(
          planRetry({
            hint: hint('proofread', reason),
            profile: MODEL_PROFILES[id],
            baseMaxTokens: 32000,
            hasRetryClient: true,
            productLimits: false,
          }),
        ).toBeNull()
      }
    }
    expect(
      planRetry({
        hint: hint('proofread', 'max-tokens'),
        profile: QWEN,
        baseMaxTokens: 16000,
        hasRetryClient: true,
        productLimits: true,
      }),
    ).toBeNull()
  })
})
