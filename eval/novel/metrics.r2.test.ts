import { describe, expect, it } from 'vitest'
import { chapterMetrics } from './metrics'

describe('chapterMetrics paragraphOpeners (P8)', () => {
  it('leaves dialogue lines out', () => {
    const text = [
      'She ran.',
      '"She is here."',
      'She stopped.',
      '“She left.”',
      'She waited.',
      'She looked up.',
    ].join('\n')
    const result = chapterMetrics(text, 'en', 10)
    expect(result.paragraphOpeners).toEqual({
      counted: 4,
      repeated: 4,
      top: [{ word: 'she', count: 4 }],
    })
    expect(result.paragraphs).toBe(6)
  })

  it('treats Korean subject forms as one opener', () => {
    const text = ['세린은 걸었다.', '세린이 멈췄다.', '세린의 손이 떨렸다.', '세린은 웃었다.'].join(
      '\n',
    )
    const result = chapterMetrics(text, 'ko', 10)
    expect(result.paragraphOpeners.top).toEqual([{ word: '세린', count: 4 }])
    expect(result.paragraphOpeners.counted).toBe(4)
  })

  it('ignores blank lines like the other paragraph metrics', () => {
    const result = chapterMetrics('세린은 걸었다.\n\n\n세린은 멈췄다.', 'ko', 10)
    expect(result.paragraphOpeners.counted).toBe(2)
    expect(result.paragraphs).toBe(2)
  })

  it('reports zeros for empty text', () => {
    for (const text of ['', '   ']) {
      expect(chapterMetrics(text, 'ko', 10).paragraphOpeners).toEqual({
        counted: 0,
        repeated: 0,
        top: [],
      })
    }
  })

  it('survives a JSON round trip', () => {
    const result = chapterMetrics('세린은 걸었다.\n세린은 멈췄다.', 'ko', 10)
    expect(JSON.parse(JSON.stringify(result.paragraphOpeners))).toEqual(result.paragraphOpeners)
  })
})
