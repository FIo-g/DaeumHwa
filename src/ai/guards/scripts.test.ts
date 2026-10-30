import { describe, expect, it } from 'vitest'
import { foreignScriptRuns, foreignScriptSpans } from './scripts'

describe('foreignScriptSpans', () => {
  it('reports a Han span with UTF-16 offsets', () => {
    expect(foreignScriptSpans('그는 以上是 말했다', 'ko')).toEqual([
      { text: '以上是', script: 'han', start: 3, end: 6 },
    ])
  })

  it('classifies kana, Cyrillic and replacement characters in text order', () => {
    const spans = foreignScriptSpans('ひらがな ' + '카타カナ Привет 깨짐\uFFFD', 'ko')
    expect(spans.map((span) => span.script)).toEqual(['kana', 'kana', 'cyrillic', 'replacement'])
    expect(spans.map((span) => span.text)).toEqual(['ひらがな', 'カナ', 'Привет', '\uFFFD'])
  })

  it('flags a 4+ letter Latin run only in Korean text', () => {
    expect(foreignScriptSpans('그는 OK 말하고 Hello 했다', 'ko')).toEqual([
      { text: 'Hello', script: 'latin', start: 10, end: 15 },
    ])
  })

  it('flags Hangul in English text', () => {
    expect(foreignScriptSpans('She said 안녕 and left.', 'en')).toEqual([
      { text: '안녕', script: 'hangul', start: 9, end: 11 },
    ])
  })

  it('finds only 4+ letter Latin runs in Korean text in the Hangul check', () => {
    const spans = foreignScriptSpans('She said 안녕 and left.', 'ko')
    expect(spans.map((span) => span.text)).toEqual(['said', 'left'])
    expect(spans.every((span) => span.script === 'latin')).toBe(true)
  })

  it('returns nothing for clean text', () => {
    expect(foreignScriptSpans('그는 문을 열었다.', 'ko')).toEqual([])
    expect(foreignScriptSpans('He opened the door.', 'en')).toEqual([])
  })

  it('drops spans whose lowercased text is allowed', () => {
    expect(foreignScriptSpans('그는 Hello 했다', 'ko', { allow: ['hello'] })).toEqual([])
  })

  it('matches the eval run order: Latin or Hangul first, then Han, kana, Cyrillic, replacement', () => {
    expect(
      foreignScriptRuns('그는 嬷嬷에게 말했다. ひらがな 카타カナ Привет 깨짐\uFFFD 끝.', 'ko'),
    ).toEqual(['嬷嬷', 'ひらがな', 'カナ', 'Привет', '\uFFFD'])
  })

  it('lists Latin runs before Han runs even when Han comes first in the text', () => {
    expect(foreignScriptRuns('嬷嬷 hello 三楼', 'ko')).toEqual(['hello', '嬷嬷', '三楼'])
    expect(foreignScriptSpans('嬷嬷 hello 三楼', 'ko').map((span) => span.start)).toEqual([0, 3, 9])
  })
})

describe('foreignScriptSpans on large and degenerate text', () => {
  const timed = <T>(run: () => T): { value: T; ms: number } => {
    const t0 = performance.now()
    const value = run()
    return { value, ms: performance.now() - t0 }
  }

  it('handles a 5,000-character paragraph with no break and flags the one foreign run', () => {
    const text = '그는조용히문을열었다'.repeat(500) + 'Hello' + '그는조용히문을열었다'.repeat(10)
    const { value, ms } = timed(() => foreignScriptSpans(text, 'ko'))
    expect(text.length).toBeGreaterThanOrEqual(5000)
    expect(value).toEqual([{ text: 'Hello', script: 'latin', start: 5000, end: 5005 }])
    expect(ms).toBeLessThan(1000)
  })

  it('returns one span for a 5,000-character run that is only foreign script', () => {
    const han = '以上是'.repeat(1700)
    const { value, ms } = timed(() => foreignScriptSpans(han, 'ko'))
    expect(value).toEqual([{ text: han, script: 'han', start: 0, end: han.length }])
    expect(ms).toBeLessThan(1000)
    expect(foreignScriptRuns(han, 'ko')).toEqual([han])

    const hangul = '안녕하세요'.repeat(1000)
    expect(foreignScriptSpans(hangul, 'en')).toEqual([
      { text: hangul, script: 'hangul', start: 0, end: hangul.length },
    ])
  })

  it('returns nothing for empty text and for text without letters', () => {
    expect(foreignScriptSpans('', 'ko')).toEqual([])
    expect(foreignScriptSpans('...!!! 123 ???\n\n', 'en')).toEqual([])
  })
})
