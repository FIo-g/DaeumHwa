import { describe, expect, it } from 'vitest'
import { locateQuote, sentenceAt, splitSentences } from '@/lib/korean/sentences'

describe('splitSentences', () => {
  it('splits on terminators, closing quotes and line breaks, with trimmed positions', () => {
    // '"' opens the quote at index 8; trimmed sentence starts are reported.
    const parts = splitSentences('그가 말했다. "정말?" 그녀는 웃었다…\n다음 줄')
    expect(parts.map((p) => p.text)).toEqual(['그가 말했다.', '"정말?"', '그녀는 웃었다…', '다음 줄'])
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
