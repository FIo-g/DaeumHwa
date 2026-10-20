import { describe, expect, it } from 'vitest'
import { isWholeWordRange, isWordChar } from '@/lib/korean/sentences'

// Round 2 (P14): whole-word test for quote hits.

describe('isWordChar', () => {
  it('is true for letters and digits, false for spaces, punctuation and undefined', () => {
    expect(isWordChar('가')).toBe(true)
    expect(isWordChar('a')).toBe(true)
    expect(isWordChar('7')).toBe(true)
    expect(isWordChar(' ')).toBe(false)
    expect(isWordChar('.')).toBe(false)
    expect(isWordChar('"')).toBe(false)
    expect(isWordChar('…')).toBe(false)
    expect(isWordChar('\n')).toBe(false)
    expect(isWordChar(undefined)).toBe(false)
  })
})

describe('isWholeWordRange', () => {
  it('a range between spaces is whole', () => {
    const text = '그도 할수 있다'
    const start = text.indexOf('할수')
    expect(isWholeWordRange(text, { start, end: start + 2 })).toBe(true)
  })

  it('a range that is the whole text is whole', () => {
    expect(isWholeWordRange('할수', { start: 0, end: 2 })).toBe(true)
  })

  it('a hit cut at the end is not whole', () => {
    expect(isWholeWordRange('할수록', { start: 0, end: 2 })).toBe(false)
  })

  it('a hit cut at the start is not whole', () => {
    expect(isWholeWordRange('못할수', { start: 1, end: 3 })).toBe(false)
  })

  it('punctuation at the edge of the range is not a cut', () => {
    expect(isWholeWordRange('갔다.그리고', { start: 0, end: 3 })).toBe(true)
  })

  it('punctuation around the range is not a cut', () => {
    expect(isWholeWordRange('"할수"', { start: 1, end: 3 })).toBe(true)
  })

  it('Latin letters and digits count as word characters', () => {
    expect(isWholeWordRange('greyhound', { start: 0, end: 4 })).toBe(false)
    expect(isWholeWordRange('the grey light', { start: 4, end: 8 })).toBe(true)
    expect(isWholeWordRange('4층이상은', { start: 0, end: 4 })).toBe(false)
  })
})
