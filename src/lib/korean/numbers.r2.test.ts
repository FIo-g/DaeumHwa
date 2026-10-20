import { describe, expect, it } from 'vitest'
import { koreanNumbersToDigits, parseNumberWord } from '@/lib/korean/numbers'

describe('parseNumberWord', () => {
  it.each([
    ['열일곱', 17, 'native'],
    ['스물일곱', 27, 'native'],
    ['스물한', 21, 'native'],
    ['스물하나', 21, 'native'],
    ['스무', 20, 'native'],
    ['스물', 20, 'native'],
    ['서른', 30, 'native'],
    ['아흔아홉', 99, 'native'],
    ['다섯', 5, 'native'],
    ['여덟', 8, 'native'],
    ['열', 10, 'native-short'],
    ['쉰', 50, 'native-short'],
    ['한', 1, 'native-short'],
    ['두', 2, 'native-short'],
    ['세', 3, 'native-short'],
    ['네', 4, 'native-short'],
  ])('reads native numbers: %s', (word, value, kind) => {
    expect(parseNumberWord(word)).toEqual({ value, kind })
  })

  it.each([
    ['십', 10, 'sino-bare'],
    ['백', 100, 'sino-bare'],
    ['천', 1000, 'sino-bare'],
    ['십칠', 17, 'sino'],
    ['이십', 20, 'sino'],
    ['이십칠', 27, 'sino'],
    ['삼백', 300, 'sino'],
    ['백이십', 120, 'sino'],
    ['이천이십', 2020, 'sino'],
    ['삼천사백오십육', 3456, 'sino'],
    ['구', 9, 'sino-one'],
    ['칠', 7, 'sino-one'],
  ])('reads Sino-Korean numbers: %s', (word, value, kind) => {
    expect(parseNumberWord(word)).toEqual({ value, kind })
  })

  it.each([
    '',
    '스무한',
    '하나',
    '둘',
    '셋',
    '넷',
    '열쇠',
    '열열',
    '스물스물',
    '일이',
    '삼사',
    '십백',
    '이십이십',
    '17',
    'constructor',
  ])('rejects what is not a number word: %s', (word) => {
    expect(parseNumberWord(word)).toBeNull()
  })
})

describe('koreanNumbersToDigits', () => {
  it.each([
    ['서윤은 열일곱 살이다.', '서윤은 17살이다.'],
    ['스무 살', '20살'],
    ['스물한 살', '21살'],
    ['스물하나 살', '21살'],
    ['스물일곱살', '27살'],
    ['서른 닢', '30닢'],
    ['마흔다섯 명', '45명'],
    ['쉰 살', '50살'],
    ['아흔아홉 개', '99개'],
    ['열 명', '10명'],
    ['열두 명이 왔다', '12명이 왔다'],
    ['열한 시간', '11시간'],
    ['열 개월', '10개월'],
    ['한 명', '1명'],
    ['두 번', '2번'],
    ['세 마리', '3마리'],
    ['네 권', '4권'],
    ['다섯 개', '5개'],
    ['여섯 마리', '6마리'],
    ['일곱 권', '7권'],
    ['여덟 층', '8층'],
    ['아홉층', '9층'],
    ['구층 꼭대기', '9층 꼭대기'],
    ['삼층', '3층'],
    ['이층', '2층'],
    ['일년', '1년'],
    ['오개월', '5개월'],
    ['십 년', '10년'],
    ['백 명', '100명'],
    ['천 명', '1000명'],
    ['이십 명', '20명'],
    ['이십칠 살', '27살'],
    ['삼백 년', '300년'],
    ['이천이십 년', '2020년'],
    ['사십오 개', '45개'],
    ['삼십번', '30번'],
    ['세 번째', '3번째'],
    ['열쇠 한 개', '열쇠 1개'],
    ['한세린은 두 번 왔다', '한세린은 2번 왔다'],
    ['"열일곱 살"이다', '"17살"이다'],
  ])('converts a number word before a counter: %s', (input, output) => {
    expect(koreanNumbersToDigits(input)).toBe(output)
  })

  it('converts every number in one sentence', () => {
    expect(koreanNumbersToDigits('열일곱 살과 열여덟 살')).toBe('17살과 18살')
    expect(koreanNumbersToDigits('스물일곱 살, 서른 닢, 한 명, 두 번')).toBe('27살, 30닢, 1명, 2번')
  })

  it.each([
    [''],
    ['Seoyun is nineteen.'],
    ['한세린은 열쇠를 쥐었다'],
    ['한층 더 높아졌다'],
    ['열명'],
    ['한명'],
    ['쉰살'],
    ['두번'],
    ['십칠 세'],
    ['이 명령을 따른다'],
    ['이번 화에서'],
    ['이명이 들린다'],
    ['일개 병사'],
    ['구 층'],
    ['삼 년 전'],
    ['백명'],
    ['천장이 높다'],
    ['백화점'],
    ['일이 개'],
    ['삼사 명'],
    ['십백 명'],
    ['스무한 살'],
    ['스물일곱쯤으로 보인다'],
    ['열일곱이 되었다'],
    ['나이는 열일곱'],
    ['3층과 19살'],
    ['1화는 입춘 아침'],
    ['한서연은 3년 전에 사라졌다'],
  ])('keeps text that is not a number before a counter: %s', (input) => {
    expect(koreanNumbersToDigits(input)).toBe(input)
  })

  it.each([
    ['19 살', '19살'],
    ['3 층과 5 층', '3층과 5층'],
    ['19살', '19살'],
  ])('glues digits to the counter: %s', (input, output) => {
    expect(koreanNumbersToDigits(input)).toBe(output)
  })

  it('is idempotent on its own output', () => {
    const outputs = [
      '서윤은 17살이다.',
      '20살',
      '21살',
      '27살',
      '30닢',
      '45명',
      '50살',
      '99개',
      '10명',
      '12명이 왔다',
      '11시간',
      '10개월',
      '1명',
      '2번',
      '3마리',
      '4권',
      '5개',
      '6마리',
      '7권',
      '8층',
      '9층',
      '9층 꼭대기',
      '3층',
      '2층',
      '1년',
      '5개월',
      '10년',
      '100명',
      '1000명',
      '20명',
      '27살',
      '300년',
      '2020년',
      '45개',
      '30번',
      '3번째',
      '열쇠 1개',
      '한세린은 2번 왔다',
      '"17살"이다',
      '17살과 18살',
      '27살, 30닢, 1명, 2번',
    ]
    for (const out of outputs) {
      expect(koreanNumbersToDigits(out)).toBe(out)
    }
  })

  it('returns long text without a match unchanged', () => {
    const inputs = [
      '열 '.repeat(50_000),
      '일이삼사오육칠팔구십백천'.repeat(20_000),
      '1 '.repeat(50_000),
      '한세린 '.repeat(50_000),
    ]
    for (const input of inputs) {
      expect(koreanNumbersToDigits(input)).toBe(input)
    }
  })
})
