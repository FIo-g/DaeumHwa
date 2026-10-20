import { describe, expect, it } from 'vitest'
import { isNearDuplicateFact } from './fact-similarity'

// Both argument orders must agree: the content-word step is order dependent for some pairs,
// and P15 must not add a new order dependence.
function both(a: string, b: string): { ab: boolean; ba: boolean } {
  return { ab: isNearDuplicateFact(a, b), ba: isNearDuplicateFact(b, a) }
}

describe('isNearDuplicateFact: Korean number words read as digits (P15)', () => {
  it.each([
    ['서윤은 열아홉 살이다.', '서윤은 19살이다.'],
    [
      '백지원은 한서연에게 은화 서른 닢을 빌린 적이 있다',
      '백지원은 한서연에게 은화 30닢을 빌린 적이 있다',
    ],
    ['잿빛 종루는 구층 석조 종탑이다', '잿빛 종루는 9층 석조 종탑이다'],
    [
      '잿빛 종루는 아홉 층 석조 종탑이며 언덕 위에 있다',
      '잿빛 종루는 9층 석조 종탑이며 언덕 위에 있다.',
    ],
    ['세린은 하루에 두 번 종루에 오른다', '세린은 하루에 2번 종루에 오른다'],
    ['종루에는 이십 명의 감시관이 있다', '종루에는 20명의 감시관이 있다'],
    ['종루에는 스무 명의 감시관이 있다', '종루에는 20명의 감시관이 있다'],
    ['종루에는 열 명의 감시관이 있다', '종루에는 10명의 감시관이 있다'],
    ['도윤서는 청해항 출신의 스물일곱 살 검사이다.', '도윤서는 청해항 출신의 27 살 검사이다'],
  ])('treats the same fact in two number forms as a duplicate: %s / %s', (a, b) => {
    expect(both(a, b)).toEqual({ ab: true, ba: true })
  })

  it('treats a reworded fact as a duplicate once the number is read', () => {
    expect(
      both('세린은 하루에 두 번 종루에 오른다.', '세린은 하루에 2번 종루에 오른다고 한다.'),
    ).toEqual({
      ab: true,
      ba: true,
    })
  })

  it.each([
    ['서윤은 열일곱 살이다.', '서윤은 18살이다.'],
    ['서윤은 열일곱 살이다.', '서윤은 열여덟 살이다.'],
    ['서윤은 열일곱 살이다.', '서윤은 16살이다.'],
    [
      '백지원은 한서연에게 은화 서른 닢을 빌린 적이 있다',
      '백지원은 한서연에게 은화 스무 닢을 빌린 적이 있다',
    ],
    ['잿빛 종루는 구층 석조 종탑이다', '잿빛 종루는 팔층 석조 종탑이다'],
    ['세린은 하루에 두 번 종루에 오른다', '세린은 하루에 세 번 종루에 오른다'],
  ])('keeps different numbers apart: %s / %s', (a, b) => {
    expect(both(a, b)).toEqual({ ab: false, ba: false })
  })

  it.each([
    ['한세린은 이 명령을 따른다', '한세린은 2명령을 따른다'],
    ['한세린은 이번에 종루에 오른다', '한세린은 2번에 종루에 오른다'],
  ])('does not turn a demonstrative into a number: %s / %s', (a, b) => {
    expect(both(a, b)).toEqual({ ab: false, ba: false })
  })

  // Documented limits. When one of these is handled, invert the expectation instead of deleting it.
  it.each([
    ['서윤의 나이는 열일곱이다', '서윤의 나이는 17이다'],
    ['서윤은 열일곱 살이다.', '서윤은 17세이다.'],
    ['잿빛 종루는 삼 층 석조 종탑이다', '잿빛 종루는 3층 석조 종탑이다'],
    ['종루에는 열명의 감시관이 있다', '종루에는 10명의 감시관이 있다'],
  ])('documented limit, not a duplicate yet: %s / %s', (a, b) => {
    expect(both(a, b)).toEqual({ ab: false, ba: false })
  })
})
