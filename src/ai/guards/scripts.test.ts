import { describe, expect, it } from 'vitest'
import { foreignScriptRuns, foreignScriptSpans } from './scripts'

describe('foreignScriptSpans', () => {
  it('reports a Han span with UTF-16 offsets', () => {
    expect(foreignScriptSpans('그는 以上是 말했다', 'ko')).toEqual([
      { text: '以上是', script: 'han', start: 3, end: 6 },
    ])
  })

  it('classifies kana, Cyrillic and replacement characters in text order', () => {
    const spans = foreignScriptSpans('ひらがな '+'카타カナ Привет 깨짐\uFFFD', 'ko')
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
    expect(foreignScriptRuns('그는 嬷嬷에게 말했다. ひらがな 카타カナ Привет 깨짐\uFFFD 끝.', 'ko')).toEqual([
      '嬷嬷',
      'ひらがな',
      'カナ',
      'Привет',
      '\uFFFD',
    ])
  })

  it('lists Latin runs before Han runs even when Han comes first in the text', () => {
    expect(foreignScriptRuns('嬷嬷 hello 三楼', 'ko')).toEqual(['hello', '嬷嬷', '三楼'])
    expect(foreignScriptSpans('嬷嬷 hello 三楼', 'ko').map((span) => span.start)).toEqual([0, 3, 9])
  })
})
