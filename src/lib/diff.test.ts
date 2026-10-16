import { describe, expect, it } from 'vitest'
import { diffStats, diffTexts } from '@/lib/diff'

describe('diffTexts', () => {
  it('reports one delete and one insert for a changed word', () => {
    const parts = diffTexts('서윤은 웃었다', '서윤은 울었다')
    expect(parts.filter((p) => p.type === 'delete')).toHaveLength(1)
    expect(parts.filter((p) => p.type === 'insert')).toHaveLength(1)
    expect(parts.find((p) => p.type === 'delete')?.value).toContain('웃었다')
    expect(parts.find((p) => p.type === 'insert')?.value).toContain('울었다')
  })

  it('returns only equal parts for identical text', () => {
    const parts = diffTexts('같은 글', '같은 글', 'chars')
    expect(parts.every((p) => p.type === 'equal')).toBe(true)
    expect(parts.map((p) => p.value).join('')).toBe('같은 글')
  })

  it('diffs by characters when asked', () => {
    const parts = diffTexts('가나다', '가나라', 'chars')
    expect(parts.find((p) => p.type === 'delete')?.value).toBe('다')
    expect(parts.find((p) => p.type === 'insert')?.value).toBe('라')
  })

  it('diffs by lines when asked', () => {
    const parts = diffTexts('첫 줄\n둘째 줄', '첫 줄\n새 줄', 'lines')
    expect(parts.filter((p) => p.type !== 'equal').map((p) => p.type)).toEqual(['delete', 'insert'])
  })
})

describe('diffStats', () => {
  it('counts inserted and deleted code points', () => {
    const parts = [
      { type: 'equal' as const, value: '가' },
      { type: 'delete' as const, value: '나다' },
      { type: 'insert' as const, value: '😀라' },
    ]
    expect(diffStats(parts)).toEqual({ inserted: 2, deleted: 2 })
  })
})
