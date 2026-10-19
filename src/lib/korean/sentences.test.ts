import { describe, expect, it } from 'vitest'
import { locateAllQuotes, locateQuote, sentenceAt, splitSentences } from '@/lib/korean/sentences'

describe('splitSentences', () => {
  it('splits on terminators, closing quotes and line breaks, with trimmed positions', () => {
    // '"' opens the quote at index 8; trimmed sentence starts are reported.
    const parts = splitSentences('그가 말했다. "정말?" 그녀는 웃었다…\n다음 줄')
    expect(parts.map((p) => p.text)).toEqual([
      '그가 말했다.',
      '"정말?"',
      '그녀는 웃었다…',
      '다음 줄',
    ])
    expect(parts.map((p) => p.start)).toEqual([0, 8, 14, 23])
    expect(parts.map((p) => p.end)).toEqual([7, 13, 22, 27])
  })

  it('returns an empty list for blank text', () => {
    expect(splitSentences('  \n ')).toEqual([])
  })
})

describe('sentenceAt', () => {
  it('returns the sentence containing an index', () => {
    const text = '그가 말했다. 그녀는 웃었다.'
    expect(sentenceAt(text, 2).text).toBe('그가 말했다.')
    expect(sentenceAt(text, 12).text).toBe('그녀는 웃었다.')
  })
})

describe('locateQuote', () => {
  it('finds an exact quote', () => {
    expect(locateQuote('가나다 라마바', '나다 라마')).toEqual({ start: 1, end: 6 })
  })

  it('matches across collapsed whitespace', () => {
    expect(locateQuote('가나다  라마', '나다 라마')).toEqual({ start: 1, end: 7 })
  })

  it('returns null when the quote is absent', () => {
    expect(locateQuote('가나다', '없음')).toBeNull()
  })

  it('prefers the occurrence nearest the hint', () => {
    expect(locateQuote('가 나 가 나', '가', 4)).toEqual({ start: 4, end: 5 })
  })
})

describe('locateAllQuotes', () => {
  it('returns every occurrence of the quote', () => {
    const text = '4층이상은 안 된다. 그러나 4층이상은 된다.'
    const ranges = locateAllQuotes(text, '4층이상은')
    expect(ranges.map((r) => r.start)).toEqual([0, text.indexOf('4층이상은', 1)])
    expect(ranges.map((r) => r.end)).toEqual(ranges.map((r) => r.start + 5))
  })

  it('does not return overlapping occurrences', () => {
    expect(locateAllQuotes('aaa', 'aa')).toEqual([{ start: 0, end: 2 }])
  })

  it('returns an empty list for an empty or absent quote', () => {
    expect(locateAllQuotes('가나다', '')).toEqual([])
    expect(locateAllQuotes('가나다', '없음')).toEqual([])
  })

  it('stops at the limit', () => {
    expect(locateAllQuotes('가나 '.repeat(30), '가나', 5)).toHaveLength(5)
  })

  // Known behavior, not an endorsement: a substring hit inside a longer word is expanded too.
  // Replace this case when a word-boundary rule is decided.
  it('expands a substring hit inside a longer word (known)', () => {
    const text = '그는커녕 그는 갔다.'
    expect(locateAllQuotes(text, '그는').map((r) => r.start)).toEqual([0, text.indexOf('그는', 1)])
  })
})
