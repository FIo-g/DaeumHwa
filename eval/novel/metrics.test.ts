import { describe, expect, it } from 'vitest'
import { chapterMetrics } from './metrics'

describe('chapterMetrics length check', () => {
  it('accepts exactly the target length for Korean', () => {
    const text = '가'.repeat(5000)
    expect(chapterMetrics(text, 'ko', 5000).lengthOk).toBe(true)
  })

  it('rejects one character under the Korean target', () => {
    const text = '가'.repeat(4999)
    expect(chapterMetrics(text, 'ko', 5000).lengthOk).toBe(false)
  })

  it('does not count line breaks toward the Korean length', () => {
    // 4,999 Hangul chars plus a paragraph break: the editor count is 4,999, so it must fail.
    const text = '가'.repeat(2500) + '\n\n' + '가'.repeat(2499)
    const result = chapterMetrics(text, 'ko', 5000)
    expect(result.chars).toBe(4999)
    expect(result.lengthOk).toBe(false)
  })

  it('rejects text above 1.3 times the target', () => {
    const text = '가'.repeat(6600)
    expect(chapterMetrics(text, 'ko', 5000).lengthOk).toBe(false)
  })

  it('accepts English text at 0.8 times the target', () => {
    const text = 'a'.repeat(800)
    expect(chapterMetrics(text, 'en', 1000).lengthOk).toBe(true)
  })
})

describe('chapterMetrics foreign runs', () => {
  it('ignores Latin runs shorter than four letters in Korean text', () => {
    expect(chapterMetrics('… 그녀는 OK라고 했다.', 'ko', 10).foreignRuns).toEqual([])
  })

  it('reports Latin runs of four or more letters in Korean text', () => {
    expect(chapterMetrics('Status report였다', 'ko', 10).foreignRuns).toEqual(['Status', 'report'])
  })

  it('reports Hangul runs in English text', () => {
    expect(chapterMetrics('She said 가자 quietly.', 'en', 10).foreignRuns).toEqual(['가자'])
  })
})

describe('chapterMetrics meta text', () => {
  it('counts a meta line once even when several patterns match it', () => {
    const result = chapterMetrics('다음은 1화 초안입니다.\n본문', 'ko', 10)
    expect(result.metaHits).toEqual(['다음은 1화 초안입니다.'])
  })

  it('returns no meta hits for plain prose', () => {
    expect(chapterMetrics('그는 걸었다.\n그녀는 멈췄다.', 'ko', 10).metaHits).toEqual([])
  })
})

describe('chapterMetrics ending', () => {
  it('flags a chapter that stops mid-sentence', () => {
    expect(chapterMetrics('문장이 끝나지 않고', 'ko', 10).endsCleanly).toBe(false)
  })

  it('accepts a chapter ending with a closing quote', () => {
    expect(chapterMetrics('"가자."', 'ko', 10).endsCleanly).toBe(true)
  })

  it('accepts a Hangul sentence ending such as 다', () => {
    expect(chapterMetrics('그는 떠났다', 'ko', 10).endsCleanly).toBe(true)
  })
})

describe('chapterMetrics paragraphs and dialogue', () => {
  it('computes the dialogue line ratio over non-empty lines', () => {
    const text = '"가자."\n\n그는 걸었다.\n"왜?"\n바람이 불었다.'
    const result = chapterMetrics(text, 'ko', 10)
    expect(result.dialogueLineRatio).toBe(0.5)
    expect(result.paragraphs).toBe(4)
  })

  it('reports zero paragraph average and ratio for empty text', () => {
    const result = chapterMetrics('   ', 'ko', 10)
    expect(result.paragraphs).toBe(0)
    expect(result.avgParagraphChars).toBe(0)
    expect(result.dialogueLineRatio).toBe(0)
    expect(result.chars).toBe(0)
  })
})
