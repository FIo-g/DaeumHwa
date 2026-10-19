import { describe, expect, it } from 'vitest'
import { chapterMetrics } from './metrics'

describe('chapterMetrics overlongParagraphs (track E1)', () => {
  it('counts one paragraph of four sentences and passes a paragraph of two', () => {
    const text = '가. 나. 다. 라.\n\n마. 바.'
    expect(chapterMetrics(text, 'ko', 10).overlongParagraphs).toBe(1)
  })

  it('does not count a paragraph of exactly three sentences', () => {
    expect(chapterMetrics('가. 나. 다.', 'ko', 10).overlongParagraphs).toBe(0)
  })

  it('reports zero for empty text', () => {
    expect(chapterMetrics('', 'ko', 10).overlongParagraphs).toBe(0)
    expect(chapterMetrics('   ', 'en', 10).overlongParagraphs).toBe(0)
  })
})
