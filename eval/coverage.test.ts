import { describe, expect, it } from 'vitest'
import { packCoverage } from './coverage'

const cards = [
  { name: '잿빛 종루', aliases: ['종루'] },
  { name: '한세린', aliases: ['세린'] },
  { name: '청해항', aliases: [] },
]

describe('packCoverage', () => {
  it('reports a named card that is missing from the rendered pack', () => {
    const renderedPack = '[E1] 한세린 (인물)\n- [F1][확정] 한세린의 나이는 16살이다.'
    const result = packCoverage('종루지기가 왔다. 세린이 웃었다.', cards, renderedPack)
    expect(result.named).toEqual(['잿빛 종루', '한세린'])
    expect(result.missing).toEqual(['잿빛 종루'])
    expect(result.rate).toBe(0.5)
  })

  it('gives rate 1 when no card is named', () => {
    const result = packCoverage('', cards, '')
    expect(result.named).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.rate).toBe(1)
  })

  it('counts a card only by its [E<n>] <name> line', () => {
    const renderedPack = '[E1] 한세린 (인물)\n- [F1][확정] 잿빛 종루는 9층 높이다.'
    const result = packCoverage('종루지기가 왔다.', cards, renderedPack)
    expect(result.named).toEqual(['잿빛 종루'])
    expect(result.missing).toEqual(['잿빛 종루'])
  })

  it('counts a card named only by a compound alias as named', () => {
    const renderedPack = '[E1] 잿빛 종루 (장소)\n- [F1][확정] 잿빛 종루는 9층 높이다.'
    const result = packCoverage('종루지기가 웃었다.', cards, renderedPack)
    expect(result.named).toEqual(['잿빛 종루'])
    expect(result.missing).toEqual([])
    expect(result.rate).toBe(1)
  })
})
