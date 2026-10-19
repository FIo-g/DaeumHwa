import { describe, expect, it } from 'vitest'
import {
  OPENER_MIN_COUNT,
  OPENER_TOP_LIMIT,
  countParagraphOpeners,
  openerWord,
} from './metrics-openers'

describe('openerWord (P8)', () => {
  it('drops a Korean subject marker', () => {
    expect(openerWord('세린은 문을 닫았다.')).toBe('세린')
    expect(openerWord('세린이 웃었다.')).toBe('세린')
    expect(openerWord('도윤서는 말이 없었다.')).toBe('도윤서')
    expect(openerWord('세린의 손이 떨렸다.')).toBe('세린')
  })

  it('keeps a Korean word that has no particle', () => {
    expect(openerWord('계단 위로 바람이 불었다.')).toBe('계단')
    expect(openerWord('한 남자가 서 있었다.')).toBe('한')
  })

  it('lowercases English and stops at an apostrophe', () => {
    expect(openerWord('She walked on.')).toBe('she')
    expect(openerWord("Serin's hand shook.")).toBe('serin')
    expect(openerWord('The bell rang.')).toBe('the')
  })

  it('skips leading quote marks, dashes and ellipses', () => {
    expect(openerWord('… 세린은 멈췄다.')).toBe('세린')
    expect(openerWord('— Then it rang.')).toBe('then')
    expect(openerWord('“Wait,” she said.')).toBe('wait')
  })

  it('keeps a token that mixes digits and Hangul as it is', () => {
    expect(openerWord('5층. 6층.')).toBe('5층')
  })

  it('returns null when the paragraph has no letter or digit', () => {
    for (const paragraph of ['', '***', '…', '—']) {
      expect(openerWord(paragraph)).toBeNull()
    }
  })
})

describe('countParagraphOpeners (P8)', () => {
  it('groups Korean forms of one name and lists words at the minimum', () => {
    const paragraphs = [
      '세린은 문을 열었다.',
      '세린이 웃었다.',
      '세린의 손이 떨렸다.',
      '세린은 멈췄다.',
      '바구니를 들었다.',
      '창문이 흔들렸다.',
    ]
    expect(countParagraphOpeners(paragraphs)).toEqual({
      counted: 6,
      repeated: 4,
      top: [{ word: '세린', count: 4 }],
    })
  })

  it('leaves words under the minimum out of top and repeated', () => {
    expect(countParagraphOpeners(['She ran.', 'She hid.', 'She wept.'])).toEqual({
      counted: 3,
      repeated: 0,
      top: [],
    })
  })

  it('orders by count then word and cuts top at the limit but not repeated', () => {
    const paragraphs = [
      'she came.',
      'she came.',
      'she came.',
      'the came.',
      'the came.',
      'the came.',
      'he came.',
      'he came.',
      'it came.',
      'it came.',
    ]
    expect(countParagraphOpeners(paragraphs, { minCount: 2, limit: 2 })).toEqual({
      counted: 10,
      repeated: 10,
      top: [
        { word: 'she', count: 3 },
        { word: 'the', count: 3 },
      ],
    })
  })

  it('uses 4 and 5 by default', () => {
    expect(OPENER_MIN_COUNT).toBe(4)
    expect(OPENER_TOP_LIMIT).toBe(5)
    const words = ['one', 'two', 'three', 'four', 'five', 'six']
    const paragraphs = words.flatMap((word) => [1, 2, 3, 4].map(() => `${word} came.`))
    const result = countParagraphOpeners(paragraphs)
    expect(result.counted).toBe(24)
    expect(result.repeated).toBe(24)
    expect(result.top.map((item) => item.word)).toEqual(['five', 'four', 'one', 'six', 'three'])
  })

  it('does not count a paragraph without an opener word', () => {
    expect(countParagraphOpeners(['***', 'She ran.', '…']).counted).toBe(1)
  })

  it('returns zeros for an empty list', () => {
    expect(countParagraphOpeners([])).toEqual({ counted: 0, repeated: 0, top: [] })
  })
})
