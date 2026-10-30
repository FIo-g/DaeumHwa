import { describe, expect, it } from 'vitest'
import {
  continuationPlan,
  continuationSeparator,
  continueFailedWarning,
  draftCharCount,
  draftLengthPlan,
} from '@/lib/draft-length'

describe('draftLengthPlan', () => {
  it('sets the minimum at the target and the maximum at 120 percent', () => {
    expect(draftLengthPlan(5000)).toEqual({
      minChars: 5000,
      maxChars: 6000,
      sceneCount: 3,
      charsPerScene: 1667,
    })
  })

  it('uses about one scene per 1,500 characters', () => {
    expect(draftLengthPlan(12100)).toEqual({
      minChars: 12100,
      maxChars: 14520,
      sceneCount: 8,
      charsPerScene: 1513,
    })
  })

  it('keeps at least two scenes for a short target', () => {
    expect(draftLengthPlan(500)).toMatchObject({ sceneCount: 2, charsPerScene: 250 })
  })
})

describe('draftCharCount', () => {
  it('trims the text and counts inner spaces but not line breaks', () => {
    expect(draftCharCount('가 나\r\n다 ')).toBe(4)
  })
})

describe('continuationPlan', () => {
  it('asks for 1.3 times the remaining characters, capped by the maximum', () => {
    expect(continuationPlan(3505, 5000)).toEqual({ count: 3505, askMin: 1944, askMax: 2495 })
  })

  it('returns null when the draft already reaches the target', () => {
    expect(continuationPlan(5000, 5000)).toBeNull()
    expect(continuationPlan(5200, 5000)).toBeNull()
  })

  it('uses the same bound for minimum and maximum when the maximum is already reached', () => {
    expect(continuationPlan(100, 500)).toEqual({ count: 100, askMin: 520, askMax: 520 })
  })
})

describe('continuationSeparator', () => {
  it('adds nothing after a blank line, one line break after a single line break, and a blank line otherwise', () => {
    expect(continuationSeparator('a\n\n')).toBe('')
    expect(continuationSeparator('a\n')).toBe('\n')
    expect(continuationSeparator('a')).toBe('\n\n')
  })
})

describe('continueFailedWarning', () => {
  it('records the reason with a detail cut to 300 characters', () => {
    const warning = continueFailedWarning('AI_ERROR', 'x'.repeat(400))
    expect(warning).toEqual({
      kind: 'continue-failed',
      reason: 'AI_ERROR',
      detail: 'x'.repeat(300),
      message: '이어쓰기 실패',
    })
  })
})
