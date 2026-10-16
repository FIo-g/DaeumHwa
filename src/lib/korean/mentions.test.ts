import { describe, expect, it } from 'vitest'
import { findMentions } from '@/lib/korean/mentions'

const targets = [
  { id: 'a', names: ['이서윤', '서윤'] },
  { id: 'b', names: ['민준'] },
  { id: 'c', names: ['강'] },
]

describe('findMentions', () => {
  const text = '이서윤이 웃었다. 서윤아, 민준이가 불렀다. 민준호는 모른다. 김민준은 왔다. (민준) 강은 흘렀다.'

  it('counts particle, vocative and boundary-respecting mentions', () => {
    const found = findMentions(text, targets)
    const a = found.find((m) => m.entryId === 'a')
    const b = found.find((m) => m.entryId === 'b')
    expect(a?.count).toBe(2)
    expect(a?.firstIndex).toBe(0)
    expect(b?.count).toBe(2)
    expect(b?.positions).toHaveLength(2)
  })

  it('ignores single-character names', () => {
    expect(findMentions(text, targets).some((m) => m.entryId === 'c')).toBe(false)
  })

  it('rejects a name that is part of a longer word', () => {
    const hits = findMentions('민준호는 왔다.', [{ id: 'b', names: ['민준'] }])
    expect(hits).toEqual([])
  })

  it('sorts by count descending, then first index', () => {
    const hits = findMentions('민준이 왔다. 서윤이 둘. 서윤이 셋.', [
      { id: 'b', names: ['민준'] },
      { id: 'a', names: ['서윤'] },
    ])
    expect(hits.map((m) => m.entryId)).toEqual(['a', 'b'])
    expect(hits[0].positions).toEqual([8, 15])
  })
})
