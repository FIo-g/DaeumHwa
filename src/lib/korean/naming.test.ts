import { describe, expect, it } from 'vitest'
import { findNamingIssues } from '@/lib/korean/naming'

describe('findNamingIssues', () => {
  it('finds a variant at a word start and reports its sentence', () => {
    const hits = findNamingIssues('레이야가 왔다. 레이아는 갔다. 플레이야말로.', [
      { id: 'r1', canonical: '레이아', variants: ['레이야'] },
    ])
    expect(hits).toEqual([
      {
        ruleId: 'r1',
        variant: '레이야',
        canonical: '레이아',
        start: 0,
        end: 3,
        sentence: '레이야가 왔다.',
      },
    ])
  })

  it('returns nothing when no variant appears', () => {
    expect(findNamingIssues('아무 말도 없다.', [{ id: 'r1', canonical: '레이아', variants: ['레이야'] }])).toEqual([])
  })
})
