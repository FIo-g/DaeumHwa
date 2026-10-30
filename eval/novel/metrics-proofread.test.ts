import { describe, expect, it } from 'vitest'
import { proofreadStats as viaMetrics } from './metrics'
import { proofreadStats } from './metrics-proofread'

const item = (id: string, quote: string, replacement = 'R', kind = 'spelling') => ({
  id,
  quote,
  replacement,
  kind,
})

describe('proofreadStats', () => {
  it('computes the acceptance ratio per item', () => {
    const items = [item('0', 'a'), item('1', 'b'), item('2', 'c'), item('3', 'd')]
    const stats = proofreadStats(items, [
      { id: '0', accept: true },
      { id: '1', accept: true },
      { id: '2', accept: false },
      { id: '3', accept: false },
    ])
    expect(stats.total).toBe(4)
    expect(stats.accepted).toBe(2)
    expect(stats.acceptanceRatio).toBe(0.5)
  })

  it('returns null ratios and zero counts for no items', () => {
    const stats = proofreadStats([], [])
    expect(stats).toEqual({
      total: 0,
      accepted: 0,
      acceptanceRatio: null,
      awkward: 0,
      sameQuoteItems: 0,
      distinctQuotes: 0,
      acceptedQuotes: 0,
      quoteAcceptanceRatio: null,
    })
  })

  it('counts awkward items and repeats of the same quote and replacement', () => {
    const stats = proofreadStats(
      [
        item('0', '어색해요', '어색합니다'),
        item('1', '어색해요', '어색합니다'),
        item('2', '좀', '조금', 'awkward'),
      ],
      [],
    )
    expect(stats.sameQuoteItems).toBe(1)
    expect(stats.awkward).toBe(1)
  })

  it('ignores decisions whose id matches no item', () => {
    const stats = proofreadStats([item('0', 'a')], [{ id: '9', accept: true }])
    expect(stats.accepted).toBe(0)
  })

  it('computes the acceptance ratio per distinct quote', () => {
    const stats = proofreadStats(
      [item('0', 'A'), item('1', 'A'), item('2', 'B')],
      [
        { id: '0', accept: true },
        { id: '1', accept: false },
        { id: '2', accept: false },
      ],
    )
    expect(stats.distinctQuotes).toBe(2)
    expect(stats.acceptedQuotes).toBe(1)
    expect(stats.quoteAcceptanceRatio).toBe(0.5)
    expect(stats.acceptanceRatio).toBeCloseTo(1 / 3)
  })

  it('is re-exported from metrics', () => {
    expect(typeof viaMetrics).toBe('function')
    expect(viaMetrics).toBe(proofreadStats)
  })
})
