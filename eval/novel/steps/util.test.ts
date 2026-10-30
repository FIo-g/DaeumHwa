import { describe, expect, it } from 'vitest'
import { pickRewriteIssueIds } from './util'

describe('pickRewriteIssueIds (track D)', () => {
  it('keeps only high-severity issues the author marked valid', () => {
    expect(
      pickRewriteIssueIds(
        [
          { id: 'a', severity: 'high' },
          { id: 'b', severity: 'medium' },
          { id: 'c', severity: 'high' },
        ],
        [
          { id: 'a', valid: true },
          { id: 'b', valid: true },
          { id: 'c', valid: false },
        ],
      ),
    ).toEqual(['a'])
  })

  it('ignores decisions for unknown issue ids', () => {
    expect(
      pickRewriteIssueIds(
        [{ id: 'a', severity: 'high' }],
        [
          { id: 'zz', valid: true },
          { id: 'a', valid: true },
        ],
      ),
    ).toEqual(['a'])
  })

  it('returns an empty list when nothing is valid or nothing is decided', () => {
    expect(pickRewriteIssueIds([{ id: 'a', severity: 'high' }], [])).toEqual([])
    expect(pickRewriteIssueIds([], [{ id: 'a', valid: true }])).toEqual([])
  })
})
