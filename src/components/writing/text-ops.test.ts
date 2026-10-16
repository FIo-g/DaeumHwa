import { describe, expect, it } from 'vitest'
import { replaceQuoteText, replaceRangeText, segmentText } from './text-ops'

describe('replaceRangeText', () => {
  it('replaces the half-open range', () => {
    expect(replaceRangeText('서윤은 웃었다', 0, 2, '이서윤')).toBe('이서윤은 웃었다')
  })

  it('inserts when start equals end', () => {
    expect(replaceRangeText('가나', 1, 1, '다')).toBe('가다나')
  })
})

describe('replaceQuoteText', () => {
  it('replaces the first occurrence of the quote', () => {
    expect(replaceQuoteText('서윤은 서윤을 봤다', '서윤을', '유나를')).toBe('서윤은 유나를 봤다')
  })

  it('prefers the occurrence at the hint offset', () => {
    expect(replaceQuoteText('서윤은 서윤을 봤다', '서윤', '유나', 4)).toBe('서윤은 유나을 봤다')
  })

  it('returns null when the quote is missing', () => {
    expect(replaceQuoteText('가나다', '라', '마')).toBeNull()
  })

  it('returns null for an empty quote', () => {
    expect(replaceQuoteText('가나다', '', '마')).toBeNull()
  })
})

describe('segmentText', () => {
  it('returns the whole text as one plain segment without highlights', () => {
    expect(segmentText('가나다', [])).toEqual([{ text: '가나다' }])
  })

  it('splits around highlights and keeps their kind', () => {
    expect(
      segmentText('가나다라', [{ id: 'h', start: 1, end: 3, kind: 'issue', active: true }]),
    ).toEqual([
      { text: '가' },
      { text: '나다', id: 'h', kind: 'issue', active: true },
      { text: '라' },
    ])
  })

  it('lets the earlier highlight win where two overlap', () => {
    expect(
      segmentText('가나다라', [
        { id: 'a', start: 0, end: 2, kind: 'comment' },
        { id: 'b', start: 1, end: 4, kind: 'reader' },
      ]),
    ).toEqual([
      { text: '가나', id: 'a', kind: 'comment', active: false },
      { text: '다라', id: 'b', kind: 'reader', active: false },
    ])
  })

  it('ignores empty or out-of-range highlights', () => {
    expect(segmentText('가나', [{ id: 'x', start: 1, end: 1, kind: 'issue' }])).toEqual([
      { text: '가나' },
    ])
  })
})
