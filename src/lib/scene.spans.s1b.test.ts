import { describe, expect, it } from 'vitest'
import { sceneSpans, spliceSpans } from '@/lib/scene'

/** The text of each span, in order. */
function texts(text: string, spans: { start: number; end: number }[]): string[] {
  return spans.map((span) => text.slice(span.start, span.end))
}

/** Ten one-line paragraphs, each separated by a blank line. */
const TEN = Array.from({ length: 10 }, (_, i) => `문단 ${i + 1}`).join('\n\n')

describe('sceneSpans', () => {
  it('splits at break lines and leaves the break lines and blank lines out', () => {
    const text = 'A1\n\nA2\n\n***\n\nB1\n\n***\n\nC1'
    expect(texts(text, sceneSpans(text, 3))).toEqual(['A1\n\nA2', 'B1', 'C1'])
  })

  it('splits paragraphs without a break line into runs of nearly equal size', () => {
    const spans = sceneSpans(TEN, 3)
    expect(texts(TEN, spans).map((t) => t.split('\n\n').length)).toEqual([4, 3, 3])
    expect(texts(TEN, spans)[0]).toBe('문단 1\n\n문단 2\n\n문단 3\n\n문단 4')
    expect(texts(TEN, spans)[2]).toBe('문단 8\n\n문단 9\n\n문단 10')
  })

  it('covers every paragraph exactly once, in order, for a text with no break line', () => {
    const spans = sceneSpans(TEN, 4)
    const joined = texts(TEN, spans).join('\n\n')
    expect(joined).toBe(TEN)
  })

  it('gives one span per paragraph when the fallback count is larger than the paragraphs', () => {
    const text = '가\n\n나'
    expect(texts(text, sceneSpans(text, 5))).toEqual(['가', '나'])
  })

  it('treats a fallback count below 1 as 1', () => {
    expect(texts(TEN, sceneSpans(TEN, 0))).toEqual([TEN])
  })
})

describe('spliceSpans', () => {
  it('replaces each span and keeps the text between spans byte-identical', () => {
    const text = '앞 문단\n\n***\n\n가운데 A\n\n***\n\n뒤 문단  \n'
    const spans = sceneSpans(text, 1)
    expect(spans.length).toBe(3)
    const out = spliceSpans(text, [
      { span: spans[0], text: '앞 문단 확장' },
      { span: spans[2], text: '뒤 문단 확장' },
    ])
    expect(out).toBe('앞 문단 확장\n\n***\n\n가운데 A\n\n***\n\n뒤 문단 확장  \n')
  })

  it('returns the text unchanged when there are no replacements', () => {
    expect(spliceSpans(TEN, [])).toBe(TEN)
  })
})
