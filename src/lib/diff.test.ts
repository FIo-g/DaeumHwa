import { describe, expect, it, vi } from 'vitest'
import { diffStats, diffTexts, diffTextsBounded } from '@/lib/diff'

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

describe('diffTextsBounded', () => {
  it.each(['words', 'chars', 'lines'] as const)(
    'returns the same parts as diffTexts for a small edit in %s mode',
    (mode) => {
      const a = '첫 줄은 그대로\n서윤은 웃었다\n마지막 줄'
      const b = '첫 줄은 그대로\n서윤은 울었다\n마지막 줄'
      expect(diffTextsBounded(a, b, mode, { timeoutMs: 1000 })).toEqual(diffTexts(a, b, mode))
    },
  )

  it.each(['words', 'chars', 'lines'] as const)(
    'returns null in %s mode once the time budget is spent',
    (mode) => {
      let calls = 0
      // The first reading starts the clock, every later one is far past the budget.
      const now = vi.spyOn(Date, 'now').mockImplementation(() => calls++ * 10_000)
      try {
        expect(
          diffTextsBounded('가 나 다\n라', '마 바 사\n아', mode, { timeoutMs: 100 }),
        ).toBeNull()
      } finally {
        now.mockRestore()
      }
    },
  )
})
