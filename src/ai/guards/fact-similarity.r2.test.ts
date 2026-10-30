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

// Commit 3 (R2 M7): the default threshold moves from 0.8 to 0.7 on the six saved 2026-10-18 runs.
describe('isNearDuplicateFact at the calibrated default (R2 M7)', () => {
  it('saved-run pair at Dice 0.77 is a duplicate by default', () => {
    expect(isNearDuplicateFact(SCRATCH_A, SCRATCH_B)).toBe(true)
  })

  it('saved-run Korean pair at Dice 0.74 is a duplicate by default', () => {
    expect(
      isNearDuplicateFact(
        '종루의 봉인을 연구하다가 3년 전에 종루 지하로 내려간 뒤 실종됐다.',
        '3년 전에 종루 지하로 내려간 뒤 실종됐다.',
      ),
    ).toBe(true)
  })

  it('the highest unlabeled saved-run pair stays apart', () => {
    expect(
      isNearDuplicateFact(
        "Serin's central goal is to get beneath the Bell Tower; she gathers the key's rule and the rumors to find the entrance",
        'The central conflict is between Serin, who wants to get beneath the Bell Tower, and the warden Baek Jiwon, who stops her.',
      ),
    ).toBe(false)
  })

  it('documented limit: a short English antonym pair is a duplicate at 0.7', () => {
    // English has no content-word check; revisit with P15.
    expect(isNearDuplicateFact('Serin is left handed.', 'Serin is right handed.')).toBe(true)
    expect(isNearDuplicateFact('Serin trusts Yunseo.', 'Serin does not trust Yunseo.')).toBe(false)
  })
})
