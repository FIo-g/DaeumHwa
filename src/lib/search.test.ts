import { describe, expect, it } from 'vitest'
import { buildSearchIndex, searchIndex, type SearchItem } from '@/lib/search'

const items: SearchItem[] = [
  { id: 'a', kind: 'character', name: '이서윤', aliases: ['서윤'], summary: '주인공' },
  { id: 'b', kind: 'character', name: '서윤', aliases: [], summary: '' },
  { id: 'c', kind: 'place', name: '왕국', aliases: ['북부 왕국'], summary: '서윤이 떠난 곳' },
  { id: 'd', kind: 'item', name: '은반지', aliases: [], summary: '' },
]

describe('searchIndex', () => {
  const index = buildSearchIndex(items)

  it('matches choseong for a consonant-only query', () => {
    expect(searchIndex(index, 'ㅅㅇ').map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('ranks an exact name above a substring match', () => {
    expect(searchIndex(index, '서윤')[0].id).toBe('b')
  })

  it('matches aliases and summaries', () => {
    expect(searchIndex(index, '북부').map((i) => i.id)).toEqual(['c'])
    expect(searchIndex(index, '떠난').map((i) => i.id)).toEqual(['c'])
  })

  it('returns nothing for an empty query and respects the limit', () => {
    expect(searchIndex(index, '   ')).toEqual([])
    expect(searchIndex(index, '서윤', 1)).toHaveLength(1)
  })
})
