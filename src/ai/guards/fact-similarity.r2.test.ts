import { describe, expect, it } from 'vitest'
import { FACT_DUPLICATE_DICE, isNearDuplicateFact } from './fact-similarity'

// R2 threshold replay (eval/novel/thresholds.ts) calls isNearDuplicateFact with an explicit
// minDice. Product callers pass no third argument and keep FACT_DUPLICATE_DICE.
const SCRATCH_A = 'The key has one thin scratch.'
const SCRATCH_B = 'The key has one thin scratch along its shaft.'

describe('isNearDuplicateFact minDice (R2 replay knob)', () => {
  it('minDice overrides the default', () => {
    // Dice 0.772: below 0.8, above 0.7.
    expect(isNearDuplicateFact(SCRATCH_A, SCRATCH_B, 0.8)).toBe(false)
    expect(isNearDuplicateFact(SCRATCH_A, SCRATCH_B, 0.7)).toBe(true)
  })

  it('omitted minDice equals FACT_DUPLICATE_DICE', () => {
    const pairs: [string, string][] = [
      [SCRATCH_A, SCRATCH_B],
      ['서윤은 검을 쓴다.', '서윤은  검을 쓴다'],
      [
        "The Bell Tower's bell sometimes trembles on its own without ringing.",
        'The bell sometimes trembles on its own without ringing.',
      ],
    ]
    for (const [a, b] of pairs) {
      expect(isNearDuplicateFact(a, b)).toBe(isNearDuplicateFact(a, b, FACT_DUPLICATE_DICE))
      expect(isNearDuplicateFact(b, a)).toBe(isNearDuplicateFact(b, a, FACT_DUPLICATE_DICE))
    }
  })

  it('the guards still apply at minDice 0', () => {
    expect(isNearDuplicateFact('서윤은 3층에 산다.', '서윤은 4층에 산다.', 0)).toBe(false)
    expect(isNearDuplicateFact('서윤은 검을 쓴다.', '서윤은 검을 쓰지 못한다.', 0)).toBe(false)
    expect(isNearDuplicateFact('서윤은 왼손잡이다', '서윤은 오른손잡이다', 0)).toBe(false)
    expect(isNearDuplicateFact('', '', 0)).toBe(false)
  })

  it('a Korean content word keeps a high-Dice pair apart at every minDice', () => {
    const a = '규칙을 앞세워 누구도 허락 없이 종루 안쪽 철문을 지나가지 못하게 막는다'
    const b = '규칙을 내세워 허락 없이는 누구도 종루 안쪽 철문을 지나가지 못하게 막는다'
    expect(isNearDuplicateFact(a, b, 0.5)).toBe(false)
    expect(isNearDuplicateFact(a, b, 0.8)).toBe(false)
  })
})
