import { describe, expect, it } from 'vitest'
import { checkTwoStep, MODEL_PROFILES, twoStepEnabled } from './models'

// Round 2 track M5 part b: --two-step on gate for the eval profiles.

const LOCAL = ['qwen3.8-27b', 'qwen3.8-27b-t06', 'gpt-oss-20b', 'exaone3.5-32b'] as const
const NON_LOCAL = ['haiku-5.5', 'luna-6', 'fake'] as const

describe('twoStepEnabled', () => {
  it('is true for every local profile', () => {
    for (const id of LOCAL) {
      expect(twoStepEnabled(MODEL_PROFILES[id], undefined)).toBe(true)
      expect(twoStepEnabled(MODEL_PROFILES[id], true)).toBe(true)
    }
  })

  it('follows the option on cloud and test profiles', () => {
    for (const id of NON_LOCAL) {
      expect(twoStepEnabled(MODEL_PROFILES[id], undefined)).toBe(false)
      expect(twoStepEnabled(MODEL_PROFILES[id], false)).toBe(false)
      expect(twoStepEnabled(MODEL_PROFILES[id], true)).toBe(true)
    }
  })
})

describe('checkTwoStep', () => {
  it('refuses local profiles, since they already run the two-step draft', () => {
    for (const id of LOCAL) {
      const refusal = checkTwoStep(MODEL_PROFILES[id])
      expect(refusal).toMatch(/already run the two-step draft/)
      expect(refusal?.startsWith(`${id}:`)).toBe(true)
    }
  })

  it('accepts cloud and test profiles', () => {
    for (const id of NON_LOCAL) {
      expect(checkTwoStep(MODEL_PROFILES[id])).toBeNull()
    }
  })
})
