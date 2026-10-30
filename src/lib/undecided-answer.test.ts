import { describe, expect, it } from 'vitest'
import { isUndecidedAnswer } from '@/lib/interview-plan'
import { isUndecidedOnlyAnswer } from '@/lib/undecided-answer'

describe('isUndecidedOnlyAnswer', () => {
  it.each([
    '그건 아직 정하지 않았어요.',
    '아직 정하지 않았어요',
    '아직 정하지 않았어요!',
    '음... 아직 정하지 않았어요.',
    '아직 정하지 않았어요. 아직 모르겠어요.',
    '결말은 아직 정하지 않았어요.',
  ])('is true for an undecided-only answer: %s', (answer) => {
    expect(isUndecidedOnlyAnswer(answer)).toBe(true)
  })

  it('agrees with isUndecidedAnswer on a filler-prefixed undecided answer', () => {
    const answer = '음... 아직 정하지 않았어요.'
    expect(isUndecidedAnswer(answer)).toBe(true)
    expect(isUndecidedOnlyAnswer(answer)).toBe(true)
  })

  it.each([
    '결말은 아직 정하지 않았어요. 세린이 종을 울리는 방향만 정했어요.',
    '아직 정하지 않았어요. 결말은 열린 채로 둘까 해요.',
  ])('is false when a content sentence is mixed in: %s', (answer) => {
    expect(isUndecidedOnlyAnswer(answer)).toBe(false)
  })

  it.each(['서윤은 검객이다.', '', '음...'])(
    'is false without an undecided sentence: %s',
    (answer) => {
      expect(isUndecidedOnlyAnswer(answer)).toBe(false)
    },
  )
})
