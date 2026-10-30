import { describe, expect, it } from 'vitest'
import {
  ExtractionSchema,
  FactsPartSchema,
  mergeExtractionParts,
  RelationsPartSchema,
  ThreadsPartSchema,
} from '@/ai/extraction'
import type { ChapterExtractInput } from '@/ai/tasks/chapter-extract'
import { fakeChapterExtraction } from '@/test/ai-fakes/chapter-extract'

const sample: ChapterExtractInput = {
  chapterText: '서윤은 검을 쥐었다. 레이아가 웃었다. 레이아는 말이 없었다. 레이아가 떠났다.',
  chapterPosition: 3,
  chapterTitle: '3화',
  known: [{ name: '서윤', kind: 'character', aliases: ['윤'] }],
  openThreads: [],
  knownFacts: [],
}

describe('extraction part schemas', () => {
  it('part schemas match the full schema', () => {
    expect(Object.keys(FactsPartSchema.shape)).toEqual(['summary', 'entries', 'facts'])
    expect(Object.keys(ThreadsPartSchema.shape)).toEqual(['threads'])
    expect(Object.keys(RelationsPartSchema.shape)).toEqual(['relations'])
  })
})

describe('mergeExtractionParts', () => {
  it('mergeExtractionParts joins parts', () => {
    const full = fakeChapterExtraction(sample)
    const merged = mergeExtractionParts({
      facts: { summary: full.summary, entries: full.entries, facts: full.facts },
      threads: { threads: full.threads },
      relations: { relations: full.relations },
    })
    expect(merged).toEqual(full)
    expect(() => ExtractionSchema.parse(merged)).not.toThrow()
  })

  it('merge keeps empty arrays', () => {
    const merged = mergeExtractionParts({
      facts: { summary: null, entries: [], facts: [] },
      threads: { threads: [] },
      relations: { relations: [] },
    })
    expect(merged).toEqual({
      summary: null,
      entries: [],
      facts: [],
      threads: [],
      relations: [],
    })
  })
})
