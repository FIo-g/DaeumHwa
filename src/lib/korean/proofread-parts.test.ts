import { describe, expect, it } from 'vitest'
import { mergeSuggestionGroups, splitProofreadParts } from '@/lib/korean/proofread-parts'

// Proofread split (track F1). Pure functions: no database, no AI client.

const SENTENCE = '그는 걸었다. '

function joined(parts: { text: string }[]): string {
  return parts.map((p) => p.text).join('')
}

describe('splitProofreadParts', () => {
  it('short text is one part', () => {
    const text = SENTENCE.repeat(1000).slice(0, 2999)
    const parts = splitProofreadParts(text)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toEqual({ start: 0, end: 2999, text })
  })

  it('empty text gives one empty part', () => {
    expect(splitProofreadParts('')).toEqual([{ start: 0, end: 0, text: '' }])
  })

  it('three paragraphs of about 2,000 chars each are cut at blank lines', () => {
    const paragraph = SENTENCE.repeat(250)
    const text = [paragraph, paragraph, paragraph].join('\n\n')
    const parts = splitProofreadParts(text)
    expect(parts).toHaveLength(3)
    expect(parts[0].text.endsWith('\n\n')).toBe(true)
    expect(parts[1].text.endsWith('\n\n')).toBe(true)
    expect(parts[2].text).toMatch(/^[가-힣]/)
    expect(joined(parts)).toBe(text)
  })

  it('gives 2 parts for 3,000 to 4,499 chars', () => {
    const half = SENTENCE.repeat(250)
    const text = `${half}\n\n${half}`
    expect(text.length).toBeGreaterThanOrEqual(3000)
    expect(text.length).toBeLessThan(4500)
    const parts = splitProofreadParts(text)
    expect(parts).toHaveLength(2)
    expect(joined(parts)).toBe(text)
  })

  it('prefers a blank line over a single newline inside the window', () => {
    const chars = Array.from('가'.repeat(6000))
    chars[1700] = '\n'
    chars[2500] = '\n'
    chars[2501] = '\n'
    const text = chars.join('')
    const parts = splitProofreadParts(text)
    expect(parts).toHaveLength(3)
    expect(parts[0].end).toBe(2502)
  })

  it('falls back to a single newline, then to a sentence end', () => {
    const newlineChars = Array.from('가'.repeat(6000))
    newlineChars[2100] = '\n'
    expect(splitProofreadParts(newlineChars.join(''))[0].end).toBe(2101)

    const sentenceChars = Array.from('가'.repeat(6000))
    sentenceChars[1900] = '.'
    sentenceChars[2300] = '?'
    expect(splitProofreadParts(sentenceChars.join(''))[0].end).toBe(1901)
  })

  it('hard cuts when there is no boundary', () => {
    const text = '가'.repeat(6000)
    const parts = splitProofreadParts(text)
    expect(parts.map((p) => [p.start, p.end])).toEqual([
      [0, 2000],
      [2000, 4000],
      [4000, 6000],
    ])
    expect(joined(parts)).toBe(text)
  })

  it('never splits a surrogate pair', () => {
    const even = '😀'.repeat(3000)
    const evenParts = splitProofreadParts(even)
    expect(joined(evenParts)).toBe(even)

    // The first target (2000) falls between the two halves of the emoji that starts at 1999.
    const shifted = '가'.repeat(1999) + '😀'.repeat(2000)
    const parts = splitProofreadParts(shifted)
    expect(parts[0].end).toBe(2001)
    for (const text of [even, shifted]) {
      for (const part of splitProofreadParts(text)) {
        expect(part.text.charCodeAt(0) >= 0xdc00 && part.text.charCodeAt(0) <= 0xdfff).toBe(false)
        const last = part.text.charCodeAt(part.text.length - 1)
        expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
      }
      expect(joined(splitProofreadParts(text))).toBe(text)
    }
  })

  it('keeps parts contiguous and cuts strictly increasing for generated texts', () => {
    const pieces = ['가나다라 ', '마바사.\n', '아자차카\n\n', '타파하. ', '😀', '\n']
    for (let seed = 1; seed <= 40; seed++) {
      let text = ''
      for (let i = 0; text.length < 4000 + seed * 137; i++) {
        text += pieces[(i * seed + i * i) % pieces.length]
      }
      const parts = splitProofreadParts(text)
      expect(joined(parts)).toBe(text)
      let expectedStart = 0
      for (const part of parts) {
        expect(part.start).toBe(expectedStart)
        expect(part.text).toBe(text.slice(part.start, part.end))
        expectedStart = part.end
      }
      expect(expectedStart).toBe(text.length)
    }
  })
})

describe('mergeSuggestionGroups', () => {
  type Item = { quote: string; replacement: string; reason: string }
  const a: Item = { quote: 'a', replacement: 'A', reason: '1' }
  const b: Item = { quote: 'b', replacement: 'B', reason: '2' }
  const c: Item = { quote: 'c', replacement: 'C', reason: '3' }

  it('keeps part order and model order inside each part', () => {
    expect(mergeSuggestionGroups([[a, b], [c]])).toEqual([a, b, c])
  })

  it('accepts empty groups', () => {
    expect(mergeSuggestionGroups<Item>([[], []])).toEqual([])
  })

  it('drops later items with the same quote and replacement', () => {
    const again: Item = { quote: 'a', replacement: 'A', reason: 'later' }
    expect(mergeSuggestionGroups([[a], [again]])).toEqual([a])
  })

  it('keeps the same quote with a different replacement', () => {
    const other: Item = { quote: 'a', replacement: 'Z', reason: 'other' }
    expect(mergeSuggestionGroups([[a], [other]])).toEqual([a, other])
  })
})
