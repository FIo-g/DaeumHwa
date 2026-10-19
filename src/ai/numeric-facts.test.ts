import { describe, expect, it } from 'vitest'
import type { ContextPack, PackEntry, PackFact } from '@/ai/context'
import { findNumericFactMismatches } from '@/ai/numeric-facts'

// Builds a pack from compact entry descriptions. Fact refs and entry refs are assigned in order.
function makePack(
  entries: {
    name: string
    aliases?: string[]
    facts: { content: string; status?: PackFact['status'] }[]
  }[],
): ContextPack {
  let factCount = 0
  const packEntries: PackEntry[] = entries.map((e, index) => ({
    ref: `E${index + 1}`,
    id: `entry-${index + 1}`,
    kind: 'character',
    name: e.name,
    aliases: e.aliases ?? [],
    summary: '',
    fields: {},
    mentionCount: 0,
    facts: e.facts.map((f) => {
      factCount += 1
      return {
        ref: `F${factCount}`,
        id: `fact-${factCount}`,
        content: f.content,
        status: f.status ?? 'confirmed',
        sourcePosition: null,
        validFromPosition: null,
        validToPosition: null,
        evidence: '',
      }
    }),
  }))
  return {
    position: 10,
    entries: packEntries,
    threads: [],
    relations: [],
    previousSummaries: [],
    namingRules: [],
    stats: {
      totalEntries: packEntries.length,
      selectedEntries: packEntries.length,
      approxChars: 0,
    },
  }
}

const yoonseo = (content = '도윤서의 나이는 27살이다.') =>
  makePack([{ name: '도윤서', aliases: ['윤서'], facts: [{ content }] }])

describe('findNumericFactMismatches', () => {
  it('flags a chapter-10-like age error with a corrected sentence', () => {
    const hits = findNumericFactMismatches({
      chapterText: '옆에서 25살의 도윤서는 말없이 고개를 끄덕였다.',
      pack: yoonseo(),
    })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      factRef: 'F1',
      entryRef: 'E1',
      wikiValue: 27,
      foundValue: 25,
      quote: '옆에서 25살의 도윤서는 말없이 고개를 끄덕였다.',
      wikiExcerpt: '도윤서의 나이는 27살이다.',
      suggestion: '옆에서 27살의 도윤서는 말없이 고개를 끄덕였다.',
    })
    expect(hits[0].start).toBe(0)
    expect(hits[0].end).toBe('옆에서 25살의 도윤서는 말없이 고개를 끄덕였다.'.length)
    expect(hits[0].explanation).toContain('27살')
    expect(hits[0].explanation).toContain('25살')
  })

  it('gives no hit when the numbers are equal', () => {
    expect(
      findNumericFactMismatches({ chapterText: '도윤서는 27살이 되었다.', pack: yoonseo() }),
    ).toEqual([])
  })

  it('gives no hit for an assumed or undecided fact', () => {
    const pack = makePack([
      {
        name: '도윤서',
        aliases: ['윤서'],
        facts: [{ content: '도윤서의 나이는 27살이다.', status: 'assumed' }],
      },
    ])
    expect(
      findNumericFactMismatches({ chapterText: '옆에서 25살의 도윤서는 웃었다.', pack }),
    ).toEqual([])
  })

  it('skips a sentence that names two entries', () => {
    const pack = makePack([
      { name: '한세린', aliases: ['세린'], facts: [{ content: '한세린의 나이는 16살이다.' }] },
      { name: '도윤서', facts: [{ content: '도윤서의 나이는 27살이다.' }] },
    ])
    expect(
      findNumericFactMismatches({ chapterText: '세린은 도윤서에게 25살이냐고 물었다.', pack }),
    ).toEqual([])
  })

  it('skips a flashback', () => {
    expect(
      findNumericFactMismatches({
        chapterText: '도윤서는 25살 때 마을을 떠났다.',
        pack: yoonseo(),
      }),
    ).toEqual([])
  })

  it('skips a time skip', () => {
    const pack = makePack([
      { name: '한세린', aliases: ['세린'], facts: [{ content: '한세린의 나이는 16살이다.' }] },
    ])
    expect(
      findNumericFactMismatches({ chapterText: '세린은 3년 뒤 19살이 되었다.', pack }),
    ).toEqual([])
  })

  it('skips a sentence with two ages', () => {
    expect(
      findNumericFactMismatches({ chapterText: '도윤서는 25살과 30살 사이였다.', pack: yoonseo() }),
    ).toEqual([])
  })

  it('skips an entry with two different confirmed ages', () => {
    const pack = makePack([
      {
        name: '도윤서',
        aliases: ['윤서'],
        facts: [
          { content: '도윤서의 나이는 27살이다.' },
          { content: '도윤서는 나이가 28살이었다.' },
        ],
      },
    ])
    expect(
      findNumericFactMismatches({ chapterText: '옆에서 25살의 도윤서는 웃었다.', pack }),
    ).toEqual([])
  })

  it('skips a possessive sentence about a relative', () => {
    const pack = makePack([
      { name: '한세린', aliases: ['세린'], facts: [{ content: '한세린의 나이는 16살이다.' }] },
    ])
    expect(findNumericFactMismatches({ chapterText: '세린의 동생은 9살이다.', pack })).toEqual([])
  })

  describe('relative ages are not the entry age', () => {
    const serin = () =>
      makePack([
        { name: '한세린', aliases: ['세린'], facts: [{ content: '한세린의 나이는 16살이다.' }] },
      ])

    it.each([
      '세린에게는 5살 어린 동생이 있었다.',
      '세린에게는 5살 많은 오빠가 있었다.',
      '세린에게는 20살이 넘은 오빠가 있었다.',
      '세린은 30살가 넘은 사람들 틈에 섞였다.',
      '5살짜리 아이가 세린을 올려다보았다.',
      '세린 곁에는 5살 위 언니가 앉아 있었다.',
      '세린 옆에는 5살 아래 동생이 앉았다.',
      '세린과 그 사람은 5살 차이가 났다.',
      '세린과 그 사람은 5살 터울이었다.',
      '세린은 5살 연상의 남자를 만났다.',
      '세린은 5살 연하의 남자를 만났다.',
      '세린은 5살배기 아이를 안아 올렸다.',
      '세린은 20살 남짓한 청년을 바라보았다.',
      '세린은 20살쯤 되어 보이는 청년을 바라보았다.',
      '세린은 20살 정도의 청년을 바라보았다.',
      '세린은 윤서보다 25살이 많았다고 했다.',
      '세린은 오빠보다 5살이었다.',
    ])('skips "%s"', (chapterText) => {
      expect(findNumericFactMismatches({ chapterText, pack: serin() })).toEqual([])
    })

    it('still flags a real age contradiction in a similar sentence', () => {
      const hits = findNumericFactMismatches({
        chapterText: '세린은 19살로 보였다.',
        pack: serin(),
      })
      expect(hits).toHaveLength(1)
      expect(hits[0].suggestion).toBe('세린은 16살로 보였다.')
    })
  })

  it('ignores a fact without 나이', () => {
    const pack = makePack([
      {
        name: '도윤서',
        aliases: ['윤서'],
        facts: [{ content: '도윤서는 27살에 검을 처음 쥐었다.' }],
      },
    ])
    expect(findNumericFactMismatches({ chapterText: '도윤서는 25살이다.', pack })).toEqual([])
  })

  it('never throws on empty text and an empty pack', () => {
    expect(findNumericFactMismatches({ chapterText: '', pack: makePack([]) })).toEqual([])
  })
})
