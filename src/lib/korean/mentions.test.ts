import { describe, expect, it } from 'vitest'
import { findMentions } from '@/lib/korean/mentions'

const targets = [
  { id: 'a', names: ['이서윤', '서윤'] },
  { id: 'b', names: ['민준'] },
  { id: 'c', names: ['강'] },
]

describe('findMentions', () => {
  const text =
    '이서윤이 웃었다. 서윤아, 민준이가 불렀다. 민준호는 모른다. 김민준은 왔다. (민준) 강은 흘렀다.'

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

describe('findMentions with copula and quotative endings', () => {
  const countIn = (text: string, name: string) =>
    findMentions(text, [{ id: 'x', names: [name] }]).reduce((sum, m) => sum + m.count, 0)

  // 서윤 ends in 받침; 지후 does not. Both take these endings.
  it.each([
    '서윤이라는 소녀',
    '서윤이라고 불렀다',
    '서윤이란',
    '서윤인데',
    '서윤이면',
    '서윤에겐',
    '서윤으로서',
    '서윤이야말로',
    '서윤이었던 소녀',
  ])('counts a 받침 name in %s', (text) => {
    expect(countIn(text, '서윤')).toBe(1)
  })

  it.each([
    '지후라는 소년',
    '지후라고 불렀다',
    '지후이라고 불렀다',
    '지후란',
    '지후인데',
    '지후한텐',
    '지후니까',
  ])('counts a vowel-ending name in %s', (text) => {
    expect(countIn(text, '지후')).toBe(1)
  })

  it('still rejects a lone 이 after a vowel-ending name and a longer word', () => {
    expect(countIn('지후이는 웃었다.', '지후')).toBe(0)
    expect(countIn('민준호는 왔다.', '민준')).toBe(0)
  })
})
