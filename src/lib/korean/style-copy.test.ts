import { describe, expect, it } from 'vitest'
import { fakeDraft } from '@/test/ai-fakes/draft-chapter'
import {
  countRepeatedWords,
  findDraftFlags,
  findRepeatedWords,
  findSampleCopies,
} from '@/lib/korean/style-copy'

// One unit is A + ' ' (10 characters), so occurrence i starts at 10 * i.
const A = '오른손을 들었다.'
const repeat = (unit: string, times: number) => unit.repeat(times)

describe('findSampleCopies', () => {
  it('flags a verbatim copy of a style-card sentence', () => {
    const example = '안개가 계단을 반쯤 삼키고 있었다.'
    const text = `세린은 문을 닫았다. ${example} 종이 울렸다.`
    const flags = findSampleCopies(text, [example])
    expect(flags).toHaveLength(1)
    expect(flags[0].kind).toBe('sample-copy')
    expect(flags[0].quote).toBe(example)
    expect(text.slice(flags[0].start, flags[0].end)).toBe(flags[0].quote)
  })

  it('flags a paraphrase that passes the 0.5 threshold', () => {
    const flags = findSampleCopies('쇠가 손바닥에 달라붙을 만큼 차가워서 세린은 손을 뗐다.', [
      '쇠가 손바닥에 들러붙을 만큼 차가웠다.',
    ])
    expect(flags).toHaveLength(1)
  })

  it('does not flag an unrelated sentence', () => {
    const flags = findSampleCopies('철문은 열쇠 구멍까지 얼어 있었고 세린은 한참을 서 있었다.', [
      '쇠가 손바닥에 들러붙을 만큼 차가웠다.',
    ])
    expect(flags).toEqual([])
  })

  it('ignores a short example sentence', () => {
    expect(findSampleCopies('"그건 아니야."', ['"그건 아니야."'])).toEqual([])
  })

  it('matches the second line of a multi-line example', () => {
    const second = '안개가 계단을 반쯤 삼키고 있었다.'
    const flags = findSampleCopies(`세린은 문을 닫았다. ${second}`, ['첫 줄은 짧다.\n' + second])
    expect(flags).toHaveLength(1)
  })

  it('flags an English verbatim copy', () => {
    const flags = findSampleCopies(
      'The iron was cold enough to stick to her palm, and she let go.',
      ['The iron was cold enough to stick to her palm.'],
      { lang: 'en' },
    )
    expect(flags).toHaveLength(1)
  })

  it('does not flag an unrelated English sentence', () => {
    const flags = findSampleCopies(
      'Mina climbed the stairs and listened to the clock tower ticking above her.',
      ['The iron was cold enough to stick to her palm.'],
      { lang: 'en' },
    )
    expect(flags).toEqual([])
  })

  it('returns nothing for empty examples', () => {
    expect(findSampleCopies('안개가 계단을 반쯤 삼키고 있었다.', [])).toEqual([])
  })
})

describe('countRepeatedWords', () => {
  it('counts a Korean word after its particles are merged', () => {
    expect(countRepeatedWords(repeat(`${A} `, 10))).toEqual([{ word: '오른손', count: 10 }])
  })

  it('stays silent below the threshold of 8', () => {
    expect(countRepeatedWords(repeat(`${A} `, 7))).toEqual([])
  })

  it('drops exempt words', () => {
    expect(countRepeatedWords(repeat(`${A} `, 10), { exempt: ['오른손'] })).toEqual([])
  })

  it('merges particles into one word', () => {
    const text = '오른손을 오른손이 오른손은 오른손도 오른손의 오른손을 오른손이 오른손은 '
    expect(countRepeatedWords(text)).toEqual([{ word: '오른손', count: 8 }])
  })

  it('skips Korean nouns that end like a verb, a known trade-off', () => {
    expect(countRepeatedWords(repeat('바다를 보았다. ', 10))).toEqual([])
  })

  it('does not count Latin words in the Korean rule', () => {
    expect(countRepeatedWords(repeat('Her left hand shook. ', 9))).toEqual([])
  })

  it('does not count did not', () => {
    expect(countRepeatedWords(repeat('She did not move. ', 30), { lang: 'en' })).toEqual([])
  })

  it('counts English left hand and drops stop-word pairs', () => {
    const counts = countRepeatedWords(repeat('Her left hand shook. ', 9), { lang: 'en' })
    expect(counts).toContainEqual({ word: 'left hand', count: 9 })
    expect(counts.some((hit) => hit.word.split(' ').some((w) => w === 'her'))).toBe(false)
  })

  it('counts an English name pair and drops it when exempt', () => {
    const text = repeat('Serin stood. ', 9)
    expect(countRepeatedWords(text, { lang: 'en' })).toContainEqual({
      word: 'serin stood',
      count: 9,
    })
    expect(countRepeatedWords(text, { lang: 'en', exempt: ['Serin'] })).toEqual([])
  })
})

describe('findRepeatedWords', () => {
  it('keeps the first three occurrences and flags the rest', () => {
    const flags = findRepeatedWords(repeat(`${A} `, 10))
    expect(flags).toHaveLength(7)
    expect(flags.every((flag) => flag.kind === 'repeated-word')).toBe(true)
    expect(flags[0]).toMatchObject({ start: 30, end: 39, quote: A })
  })

  it('skips exempt words entirely', () => {
    expect(findRepeatedWords(repeat(`${A} `, 10), { exempt: ['오른손'] })).toEqual([])
  })

  it('flags one sentence per hit even when two English pairs land on it', () => {
    const flags = findRepeatedWords(repeat('Her left hand shook. ', 9), { lang: 'en' })
    expect(flags).toHaveLength(6)
    expect(flags[0].quote).toBe('Her left hand shook.')
  })

  it('caps the flags at maxFlags, earliest first', () => {
    const flags = findRepeatedWords(repeat(`${A} `, 30), { maxFlags: 5 })
    expect(flags).toHaveLength(5)
  })
})

describe('findDraftFlags', () => {
  it('lets a sample copy take the place of a repeated-word flag on the same sentence', () => {
    const B = '오른손을 높이 들어 올렸다.'
    const flags = findDraftFlags(repeat(`${B} `, 10), { examples: [B] })
    expect(flags).toHaveLength(10)
    expect(flags.every((flag) => flag.kind === 'sample-copy')).toBe(true)
    for (let i = 1; i < flags.length; i++) {
      expect(flags[i].start).toBeGreaterThan(flags[i - 1].start)
    }
  })
})

describe('draft fixture', () => {
  it('the demo draft has no repeated word', () => {
    const text = fakeDraft({ instructions: '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.' })
    expect(countRepeatedWords(text)).toEqual([])
    expect(findDraftFlags(text, { examples: [] })).toEqual([])
  })
})
