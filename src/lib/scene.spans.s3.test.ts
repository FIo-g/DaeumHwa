import { describe, expect, it } from 'vitest'
import { sceneSpans } from '@/lib/scene'
import { splitParagraphs } from '@/lib/korean/paragraphs'

function paragraphCounts(text: string, fallbackCount: number): number[] {
  const spans = sceneSpans(text, fallbackCount)
  const paragraphs = splitParagraphs(text)
  return spans.map(
    (span) => paragraphs.filter((p) => p.start >= span.start && p.end <= span.end).length,
  )
}

describe('sceneSpans with break lines', () => {
  it('gives three spans for two *** lines and excludes the break lines', () => {
    const text = [
      '첫 장면 문장이다.',
      '***',
      '둘째 장면 문장이다.',
      '***',
      '셋째 장면 문장이다.',
    ].join('\n')
    const spans = sceneSpans(text, 2)
    expect(spans).toHaveLength(3)
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).not.toContain('***')
    }
    expect(text.slice(spans[0].start, spans[0].end)).toContain('첫 장면 문장이다.')
    expect(text.slice(spans[1].start, spans[1].end)).toContain('둘째 장면 문장이다.')
    expect(text.slice(spans[2].start, spans[2].end)).toContain('셋째 장면 문장이다.')
  })
})

describe('sceneSpans without break lines', () => {
  it('splits 10 paragraphs into runs of 4, 3, 3 for fallbackCount 3', () => {
    const text = Array.from({ length: 10 }, (_, i) => `문단${i + 1} 내용이다.`).join('\n')
    const spans = sceneSpans(text, 3)
    expect(spans).toHaveLength(3)
    expect(paragraphCounts(text, 3)).toEqual([4, 3, 3])
  })
})
