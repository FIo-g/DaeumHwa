import { describe, expect, it } from 'vitest'
import { FACT_DUPLICATE_DICE, isNearDuplicateFact } from './fact-similarity'
import { bigramDice } from './similarity'

// Documented limits (spec section 6): antonyms inside long sentences and number words are not
// handled. The tests under "documented limit" lock in the current misses. When antonym or
// number handling lands, invert those expectations instead of deleting them.
describe('isNearDuplicateFact', () => {
  it('uses the spec threshold of 0.8', () => {
    expect(FACT_DUPLICATE_DICE).toBe(0.8)
  })

  it('treats the same fact after spacing and a final period as a duplicate', () => {
    expect(isNearDuplicateFact('서윤은 검을 쓴다.', '서윤은  검을 쓴다')).toBe(true)
  })

  it('treats a close rewording as a duplicate', () => {
    expect(
      isNearDuplicateFact('종루의 종은 밤마다 떨린다.', '종루의 종은 밤마다 떨린다고 한다.'),
    ).toBe(true)
  })

  it('treats a rephrase as a duplicate', () => {
    expect(isNearDuplicateFact('서윤은 왼손잡이다', '서윤은 왼손잡이이다')).toBe(true)
  })

  it('keeps different facts about the same subject apart', () => {
    expect(isNearDuplicateFact('서윤은 검을 쓴다.', '서윤은 왼손잡이다.')).toBe(false)
  })

  it('keeps a contradiction by an age word apart', () => {
    expect(isNearDuplicateFact('서윤은 열일곱 살이다.', '서윤은 열여덟 살이다.')).toBe(false)
  })

  it('blocks near-equal text whose digits differ', () => {
    expect(
      isNearDuplicateFact(
        '세린은 청해항 고아원에서 자란 16살 소녀다',
        '세린은 청해항 고아원에서 자란 19살 소녀다',
      ),
    ).toBe(false)
    expect(isNearDuplicateFact('서윤은 3층에 산다.', '서윤은 4층에 산다.')).toBe(false)
  })

  it('keeps a negated fact apart', () => {
    expect(isNearDuplicateFact('서윤은 검을 쓴다.', '서윤은 검을 쓰지 못한다.')).toBe(false)
  })

  it.each([
    ['한세린은 성검을 가지고 있다', '한세린은 성검을 가지고 있지 않다'],
    ['한세린과 서윤은 어릴 적부터 사이가 좋다', '한세린과 서윤은 어릴 적부터 사이가 나쁘다'],
    ['한세린은 북쪽 성문 경비대 소속이다', '한세린은 남쪽 성문 경비대 소속이다'],
    ['한세린의 머리카락은 검은색이다', '한세린의 머리카락은 은색이다'],
    ['한세린은 아버지가 살아 있다고 믿는다', '한세린은 아버지가 살아 있지 않다고 믿는다'],
  ])('keeps a one-word contradiction in a normal-length sentence apart (%s)', (a, b) => {
    // The pair is only a regression test while Dice alone would call it a duplicate.
    expect(bigramDice(a, b)).toBeGreaterThanOrEqual(FACT_DUPLICATE_DICE)
    expect(isNearDuplicateFact(a, b)).toBe(false)
    expect(isNearDuplicateFact(b, a)).toBe(false)
  })

  it('keeps a short antonym apart', () => {
    expect(isNearDuplicateFact('서윤은 왼손잡이다', '서윤은 오른손잡이다')).toBe(false)
  })

  it('compares English after normalization', () => {
    expect(isNearDuplicateFact('Serin is left handed.', 'Serin is left-handed.')).toBe(true)
  })

  it('keeps a Korean antonym inside a long sentence apart', () => {
    expect(
      isNearDuplicateFact(
        '서윤은 청해항 출신이며 왼손잡이다',
        '서윤은 청해항 출신이며 오른손잡이다',
      ),
    ).toBe(false)
  })

  it('treats spacing and period variants of a long sentence as a duplicate', () => {
    expect(
      isNearDuplicateFact(
        '한세린은 북쪽 성문 경비대 소속이다.',
        '한세린은 북쪽 성문  경비대 소속이다',
      ),
    ).toBe(true)
  })

  it('documented limit: an English antonym inside a long sentence is reported as a duplicate', () => {
    expect(
      isNearDuplicateFact('Serin is right-handed and calm.', 'Serin is left-handed and calm.'),
    ).toBe(true)
  })

  it('documented limit: a number word is not matched to its digits', () => {
    expect(isNearDuplicateFact('Seoyun is 19.', 'Seoyun is nineteen.')).toBe(false)
  })

  it('returns false for empty and very short input', () => {
    expect(isNearDuplicateFact('', '')).toBe(false)
    expect(isNearDuplicateFact('', '서윤')).toBe(false)
    expect(isNearDuplicateFact('a', 'b')).toBe(false)
  })
})
