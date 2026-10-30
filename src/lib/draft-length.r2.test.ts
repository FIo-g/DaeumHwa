import { describe, expect, it } from 'vitest'
import { draftLengthPlan } from '@/lib/draft-length'

// Round 2 P1, Part B: a beat list can override the plan's scene count.

describe('P1 draftLengthPlan scene count override', () => {
  it('uses a given scene count', () => {
    expect(draftLengthPlan(5500, 6)).toEqual({
      minChars: 5500,
      maxChars: 6600,
      sceneCount: 6,
      charsPerScene: 917,
    })
  })

  it('falls back to the plan for an invalid count', () => {
    const plan = draftLengthPlan(5500)
    expect(plan).toEqual({ minChars: 5500, maxChars: 6600, sceneCount: 4, charsPerScene: 1375 })
    for (const bad of [0, -1, 2.5, Number.NaN, undefined]) {
      expect(draftLengthPlan(5500, bad)).toEqual(plan)
    }
  })

  it('allows a single scene', () => {
    const plan = draftLengthPlan(3000, 1)
    expect(plan.sceneCount).toBe(1)
    expect(plan.charsPerScene).toBe(3000)
  })
})
