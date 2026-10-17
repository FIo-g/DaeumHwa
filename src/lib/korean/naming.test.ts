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
    expect(
      findNamingIssues('아무 말도 없다.', [
        { id: 'r1', canonical: '레이아', variants: ['레이야'] },
      ]),
    ).toEqual([])
  })

  it('does not flag a correct canonical spelling that starts with a variant', () => {
    expect(
      findNamingIssues('카일론이 웃었다.', [{ id: 'r1', canonical: '카일론', variants: ['카일'] }]),
    ).toEqual([])
  })

  it('flags only the wrong occurrence when the variant is a prefix of the canonical name', () => {
    const hits = findNamingIssues('엘리자베스는 갔다. 엘리자는 왔다.', [
      { id: 'r1', canonical: '엘리자베스', variants: ['엘리자'] },
    ])
    expect(hits).toEqual([
      {
        ruleId: 'r1',
        variant: '엘리자',
        canonical: '엘리자베스',
        start: 11,
        end: 14,
        sentence: '엘리자는 왔다.',
      },
    ])
  })

  it('does not flag a variant inside another rule canonical name', () => {
    expect(
      findNamingIssues('카일러가 웃었다.', [
        { id: 'a', canonical: '카일론', variants: ['카일'] },
        { id: 'b', canonical: '카일러', variants: [] },
      ]),
    ).toEqual([])
  })

  it('still reports a variant that extends beyond the canonical name', () => {
    const hits = findNamingIssues('카일론느가 웃었다.', [
      { id: 'r1', canonical: '카일론', variants: ['카일론느'] },
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ start: 0, end: 4, variant: '카일론느' })
  })
})
