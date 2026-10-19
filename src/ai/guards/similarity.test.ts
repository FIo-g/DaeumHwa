import { describe, expect, it } from 'vitest'
import { bigramDice, gramContainment, normalizeForCompare } from './similarity'

describe('normalizeForCompare', () => {
  it('lowercases and drops spaces and punctuation', () => {
    expect(normalizeForCompare('Hello, World!')).toBe('helloworld')
  })
})

describe('bigramDice', () => {
  it('is 1 for identical strings', () => {
    expect(bigramDice('서윤은 왼손잡이다', '서윤은 왼손잡이다')).toBe(1)
  })

  it('scores one changed syllable about 0.667', () => {
    expect(bigramDice('서윤은 왼손잡이다', '서윤은 오른손잡이다')).toBeCloseTo(0.667, 2)
  })

  it('is 0 when one side is empty', () => {
    expect(bigramDice('', 'a')).toBe(0)
  })
})

describe('gramContainment', () => {
  it('finds a changed-syllable example inside the draft', () => {
    expect(
      gramContainment('쇠가 손바닥에 들러붙을 만큼 차가웠다.', '쇠가 손바닥에 달라붙을 만큼 차가웠다.'),
    ).toBeCloseTo(0.714, 2)
  })

  it('is asymmetric: a short example inside a longer draft scores 1', () => {
    expect(gramContainment('가나다', '가나다라마')).toBe(1)
    expect(gramContainment('가나다라마', '가나다')).toBeCloseTo(0.333, 2)
  })

  it('is 0 when the example has no 3-gram', () => {
    expect(gramContainment('가나', '가나다')).toBe(0)
  })
})
