import { describe, expect, it } from 'vitest'
import {
  countSentences,
  dialogueSpans,
  hasOverlongSpan,
  overlongParagraphs,
  protectNonTerminatorDots,
  replaceParagraphs,
  splitParagraphs,
} from '@/lib/korean/paragraphs'

describe('paragraph sentence counts', () => {
  it('counts sentences per paragraph and flags only the overlong one', () => {
    const text = '가. 나. 다.\n\n라. 마. 바. 사.'
    const paragraphs = splitParagraphs(text)
    expect(paragraphs).toHaveLength(2)
    expect(countSentences(paragraphs[0].text)).toBe(3)
    expect(countSentences(paragraphs[1].text)).toBe(4)
    expect(overlongParagraphs(text)).toEqual([
      { index: 1, text: '라. 마. 바. 사.', start: 10, end: 21, sentences: 4 },
    ])
  })

  it('does not flag a paragraph with exactly three sentences', () => {
    expect(overlongParagraphs('가. 나. 다.')).toEqual([])
  })

  it('keeps a closing quote with its sentence', () => {
    expect(countSentences('"가자." 그가 말했다. "싫어."')).toBe(3)
  })

  it('counts an ellipsis run as one terminator', () => {
    expect(countSentences('그는 말없이… 보았다. 끝.')).toBe(3)
  })

  it('counts a text without a final mark as one sentence, and blank text has no paragraphs', () => {
    expect(countSentences('그는 떠났다')).toBe(1)
    expect(splitParagraphs('   ')).toEqual([])
  })

  it('does not split on decimals or on abbreviations', () => {
    expect(countSentences('값은 3.5배였다.')).toBe(1)
    expect(countSentences('Mr. Park said no. She left.')).toBe(2)
  })

  it('reports offsets of the trimmed text in the original', () => {
    expect(splitParagraphs('  A. B.  \n\nC.')).toEqual([
      { index: 0, text: 'A. B.', start: 2, end: 7 },
      { index: 1, text: 'C.', start: 11, end: 13 },
    ])
  })
})

describe('replaceParagraphs', () => {
  it('replaces only the listed paragraph and keeps every other byte', () => {
    const text = 'A.\n\nB. C. D. E.\n\nF.'
    const result = replaceParagraphs(text, [{ index: 1, text: 'B. C.\n\nD. E.' }])
    expect(result).toBe('A.\n\nB. C.\n\nD. E.\n\nF.')
    expect(splitParagraphs(result)).toHaveLength(4)
  })

  it('ignores an unknown index', () => {
    const text = 'A.\n\nB.'
    expect(replaceParagraphs(text, [{ index: 9, text: 'X.' }])).toBe(text)
  })
})

describe('dialogue and non-terminator dots', () => {
  it('finds straight, curly and corner-bracket dialogue', () => {
    expect(dialogueSpans('그가 "가자." 했다. “싫어.”')).toEqual(['"가자."', '“싫어.”'])
  })

  it('protects only the dot, keeping the length and the letters', () => {
    const protectedText = protectNonTerminatorDots('Mr. Park paid 3.5. Done.')
    expect(protectedText).toHaveLength('Mr. Park paid 3.5. Done.'.length)
    expect(protectedText).toBe('Mr Park paid 35. Done.')
  })

  it('flags a quoted span with more than the limit of sentences', () => {
    expect(hasOverlongSpan('"가. 나. 다. 라." 그가 말했다.', 3)).toBe(true)
    expect(hasOverlongSpan('"가자." 그가 말했다.', 3)).toBe(false)
  })
})

describe('large inputs', () => {
  it('handles a single 5,000-character paragraph without throwing', () => {
    const text = '가. '.repeat(1250).trimEnd()
    expect(text.length).toBeGreaterThanOrEqual(3700)
    const result = overlongParagraphs(text)
    expect(result).toHaveLength(1)
    expect(result[0].sentences).toBe(1250)
    expect(hasOverlongSpan(text, 3)).toBe(false)
  })

  it('handles 5,000 characters without a terminator or a line break as one sentence', () => {
    const text = '가'.repeat(5000)
    expect(splitParagraphs(text)).toHaveLength(1)
    expect(countSentences(text)).toBe(1)
    expect(overlongParagraphs(text)).toEqual([])
  })

  it('handles a long run of terminators and a long quoted span', () => {
    expect(() => overlongParagraphs('.'.repeat(5000))).not.toThrow()
    expect(dialogueSpans(`"${'가. '.repeat(1600)}"`)).toHaveLength(1)
  })
})
