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

describe('draft_review metrics read from saved runs', () => {
  it('parses a pending item written before sampleCopyHits and repeatedWords existed', () => {
    const parsed = PendingSchema.parse({ ...review, metrics })
    expect(parsed.kind === 'draft_review' && parsed.metrics).toMatchObject({
      sampleCopyHits: 0,
      repeatedWords: [],
    })
  })

  it('keeps the new fields when they are present', () => {
    const parsed = PendingSchema.parse({
      ...review,
      metrics: { ...metrics, sampleCopyHits: 2, repeatedWords: [{ word: '오른손', count: 9 }] },
    })
    expect(parsed.kind === 'draft_review' && parsed.metrics).toMatchObject({
      sampleCopyHits: 2,
      repeatedWords: [{ word: '오른손', count: 9 }],
    })
  })
})
