import { describe, expect, it } from 'vitest'
import { type ExpectedIssue, type FoundIssue, scoreIssues, scoreNotDefects } from './score'

const expectedRight: ExpectedIssue = {
  chapter: 4,
  quoteIncludes: '세린은 오른손으로 열쇠를 돌렸다',
  kind: 'contradiction',
}

describe('scoreIssues', () => {
  it('counts a found quote that contains the expected fragment as a hit', () => {
    const found: FoundIssue[] = [
      { chapter: 4, quote: '세린은 오른손으로 열쇠를 돌렸다.', kind: 'contradiction' },
    ]
    const score = scoreIssues([expectedRight], found)
    expect(score.hits).toBe(1)
    expect(score.misses).toEqual([])
    expect(score.falsePositives).toEqual([])
    expect(score.precision).toBe(1)
    expect(score.recall).toBe(1)
  })

  it('also counts a found quote that is contained in the expected fragment as a hit', () => {
    const found: FoundIssue[] = [{ chapter: 4, quote: '오른손으로 열쇠를', kind: 'contradiction' }]
    const score = scoreIssues([expectedRight], found)
    expect(score.hits).toBe(1)
    expect(score.falsePositives).toEqual([])
  })

  it('treats the same quote in a different chapter as a miss and a false positive', () => {
    const found: FoundIssue[] = [
      { chapter: 5, quote: '세린은 오른손으로 열쇠를 돌렸다.', kind: 'contradiction' },
    ]
    const score = scoreIssues([expectedRight], found)
    expect(score.hits).toBe(0)
    expect(score.misses).toEqual([expectedRight])
    expect(score.falsePositives).toEqual(found)
    expect(score.precision).toBe(0)
    expect(score.recall).toBe(0)
  })

  it('does not treat unrelated quotes in the same chapter as hits', () => {
    const found: FoundIssue[] = [{ chapter: 4, quote: '바람이 불었다.', kind: 'naming' }]
    const score = scoreIssues([expectedRight], found)
    expect(score.hits).toBe(0)
    expect(score.falsePositives).toHaveLength(1)
  })

  it('lets each found issue match at most one expected issue', () => {
    const expected: ExpectedIssue[] = [
      { chapter: 8, quoteIncludes: '종을 세 번', kind: 'contradiction' },
      { chapter: 8, quoteIncludes: '종을 세 번 연달아 울렸다', kind: 'contradiction' },
    ]
    const found: FoundIssue[] = [
      { chapter: 8, quote: '세린은 종을 세 번 연달아 울렸다.', kind: 'contradiction' },
    ]
    const score = scoreIssues(expected, found)
    expect(score.hits).toBe(1)
    expect(score.misses).toHaveLength(1)
    expect(score.falsePositives).toEqual([])
  })

  it('lets each expected issue be hit at most once', () => {
    const found: FoundIssue[] = [
      { chapter: 4, quote: '세린은 오른손으로 열쇠를 돌렸다.', kind: 'contradiction' },
      { chapter: 4, quote: '세린은 오른손으로 열쇠를 돌렸다.', kind: 'contradiction' },
    ]
    const score = scoreIssues([expectedRight], found)
    expect(score.hits).toBe(1)
    expect(score.falsePositives).toHaveLength(1)
  })

  it('finds a maximum matching when a greedy pass would leave a hit unmatched', () => {
    const expected: ExpectedIssue[] = [
      { chapter: 9, quoteIncludes: '가', kind: 'naming' },
      { chapter: 9, quoteIncludes: '나', kind: 'naming' },
    ]
    const found: FoundIssue[] = [
      { chapter: 9, quote: '가나', kind: 'naming' },
      { chapter: 9, quote: '가다', kind: 'naming' },
    ]
    const score = scoreIssues(expected, found)
    expect(score.hits).toBe(2)
    expect(score.misses).toEqual([])
    expect(score.falsePositives).toEqual([])
  })

  it('computes precision and recall from hits, false positives and misses', () => {
    const expected: ExpectedIssue[] = [
      { chapter: 3, quoteIncludes: '가', kind: 'naming' },
      { chapter: 4, quoteIncludes: '나', kind: 'contradiction' },
      { chapter: 5, quoteIncludes: '다', kind: 'timeline' },
      { chapter: 6, quoteIncludes: '라', kind: 'thread' },
    ]
    const found: FoundIssue[] = [
      { chapter: 3, quote: '가', kind: 'naming' },
      { chapter: 4, quote: '나', kind: 'contradiction' },
      { chapter: 6, quote: '라', kind: 'thread' },
      { chapter: 2, quote: '마', kind: 'other' },
      { chapter: 7, quote: '바', kind: 'other' },
    ]
    const score = scoreIssues(expected, found)
    expect(score.hits).toBe(3)
    expect(score.misses.map((m) => m.chapter)).toEqual([5])
    expect(score.falsePositives.map((f) => f.chapter)).toEqual([2, 7])
    expect(score.precision).toBeCloseTo(3 / 5)
    expect(score.recall).toBeCloseTo(3 / 4)
  })

  it('returns zero precision when nothing is found and full recall when nothing is expected', () => {
    expect(scoreIssues([expectedRight], [])).toMatchObject({
      hits: 0,
      precision: 0,
      recall: 0,
    })
    expect(scoreIssues([], [])).toMatchObject({ hits: 0, precision: 0, recall: 1 })
  })
})

describe('scoreNotDefects', () => {
  const trap = { chapter: 4, quoteIncludes: '윤서는 말없이 지도를 펼쳤다' }

  it('returns the found issue that hits a trap in the same chapter', () => {
    const found: FoundIssue[] = [
      { chapter: 4, quote: '윤서는 말없이 지도를 펼쳤다.', kind: 'contradiction' },
    ]
    expect(scoreNotDefects([trap], found)).toEqual(found)
  })

  it('ignores a found issue in another chapter', () => {
    const found: FoundIssue[] = [
      { chapter: 3, quote: '윤서는 말없이 지도를 펼쳤다.', kind: 'contradiction' },
    ]
    expect(scoreNotDefects([trap], found)).toEqual([])
  })

  it('ignores a short found quote that is only a fragment of the trap', () => {
    const found: FoundIssue[] = [{ chapter: 4, quote: '윤서는', kind: 'contradiction' }]
    expect(scoreNotDefects([trap], found)).toEqual([])
  })
})
