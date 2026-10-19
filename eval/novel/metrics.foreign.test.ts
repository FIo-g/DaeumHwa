import { describe, expect, it } from 'vitest'
import { chapterMetrics } from './metrics'

// Golden cases for ChapterMetrics.foreignRuns. Written against the pre-guard regexes and kept
// unchanged when the computation moves to @/ai/guards, so the eval output stays identical.
describe('chapterMetrics foreignRuns (golden)', () => {
  const runs = (text: string, lang: 'ko' | 'en') => chapterMetrics(text, lang, 1000).foreignRuns

  it('ko: Latin 4+ runs come before Han runs, short Latin is ignored', () => {
    const text = '그는 hello 세상을 보았다. 嬷嬷가 말했다. OK 三楼에서 Hello?'
    expect(runs(text, 'ko')).toEqual(['hello', 'Hello', '嬷嬷', '三楼'])
  })

  it('en: Hangul runs come before Han runs', () => {
    const text = 'She said 안녕 and 嬷嬷 left 세린.'
    expect(runs(text, 'en')).toEqual(['안녕', '세린', '嬷嬷'])
  })

  it('ko: kana runs are flagged', () => {
    const text = '그는 ひらがな와 カタカナ를 읽었다.'
    expect(runs(text, 'ko')).toEqual(['ひらがな', 'カタカナ'])
  })

  it('ko: Cyrillic run stops at the Hangul particle', () => {
    const text = '그는 Привет라고 말했다.'
    expect(runs(text, 'ko')).toEqual(['Привет'])
  })

  it('ko: U+FFFD is flagged', () => {
    const text = '깨진 \uFFFD 글자'
    expect(runs(text, 'ko')).toEqual(['\uFFFD'])
  })

  it('ko: several runs of each kind in one text', () => {
    const text = '그는 hello 와 Hello, 嬷嬷 그리고 三楼の, 그리고 Привет 그리고 ひら 끝 world'
    expect(runs(text, 'ko')).toEqual(['hello', 'Hello', 'world', '嬷嬷', '三楼の', 'Привет', 'ひら'])
  })

  it('ko: clean text has no runs', () => {
    expect(runs('그는 문을 열었다. 세린은 말이 없었다.', 'ko')).toEqual([])
  })

  it('en: clean text has no runs', () => {
    expect(runs('He opened the door and waited.', 'en')).toEqual([])
  })
})
