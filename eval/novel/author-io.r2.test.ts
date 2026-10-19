import { describe, expect, it } from 'vitest'
import { PendingSchema } from './author-io'

const metrics = {
  chars: 120,
  targetChars: 100,
  lengthOk: true,
  foreignRuns: [],
  metaHits: [],
  endsCleanly: true,
  paragraphs: 3,
  avgParagraphChars: 40,
  dialogueLineRatio: 0.2,
}

const review = {
  kind: 'draft_review',
  step: 'ch1:draft',
  chapter: 1,
  attempt: 1,
  maxAttempts: 3,
  instructions: '서윤이 편지를 발견한다.',
  mustInclude: [],
  textFile: 'chapters/01.attempt-1.md',
}

describe('draft_review paragraphOpeners read from saved runs (P8)', () => {
  it('parses a pending item written before paragraphOpeners existed', () => {
    const parsed = PendingSchema.parse({ ...review, metrics })
    expect(parsed.kind === 'draft_review' && parsed.metrics.paragraphOpeners).toEqual({
      counted: 0,
      repeated: 0,
      top: [],
    })
  })

  it('keeps paragraphOpeners when present', () => {
    const value = { counted: 40, repeated: 22, top: [{ word: '세린', count: 11 }] }
    const parsed = PendingSchema.parse({
      ...review,
      metrics: { ...metrics, paragraphOpeners: value },
    })
    expect(parsed.kind === 'draft_review' && parsed.metrics.paragraphOpeners).toEqual(value)
  })

  it('rejects a paragraphOpeners value of the wrong shape', () => {
    const result = PendingSchema.safeParse({
      ...review,
      metrics: { ...metrics, paragraphOpeners: { counted: 1, repeated: 0, top: 'x' } },
    })
    expect(result.success).toBe(false)
  })
})
