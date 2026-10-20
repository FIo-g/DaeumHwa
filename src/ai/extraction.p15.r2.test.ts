import { describe, expect, it } from 'vitest'
import type { NewProposal } from '@/lib/proposal-payloads'
import { type Extraction, type ExtractionContext, extractionToProposals } from '@/ai/extraction'

// Helpers copied from extraction.G1.test.ts (not exported there).
const emptyExtraction: Extraction = {
  summary: null,
  entries: [],
  facts: [],
  threads: [],
  relations: [],
}

function makeCtx(over: Partial<ExtractionContext> = {}): ExtractionContext {
  return {
    source: 'post_chapter',
    sourceRef: 'chapter-ref-5',
    chapterId: 'ch-5',
    chapterPosition: 5,
    existingEntries: [{ id: 'e-seoyun', name: '서윤', aliases: ['윤'], kind: 'character' }],
    threadRefs: new Map([['T1', { id: 't-1', title: '낡은 편지' }]]),
    factRefs: new Map([['F1', { id: 'f-1' }]]),
    ...over,
  }
}

function byType<K extends NewProposal['type']>(
  list: NewProposal[],
  type: K,
): Extract<NewProposal, { type: K }>[] {
  return list.filter((p): p is Extract<NewProposal, { type: K }> => p.type === type)
}

const fact = (
  subjectName: string,
  content: string,
  evidence: string,
  supersedesFactRef: string | null = null,
): Extraction['facts'][number] => ({
  subjectName,
  content,
  evidence,
  suggestedStatus: 'confirmed',
  supersedesFactRef,
})

describe('extraction: fact duplicates across number forms (P15)', () => {
  it('drops a fact that repeats an existing fact in another number form', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('서윤', '서윤은 17살이다.', '서윤은 17살이다.')],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({
        sourceText: '서윤은 17살이다.',
        existingFacts: [
          { entryId: 'e-seoyun', subjectName: '서윤', content: '서윤은 열일곱 살이다.' },
        ],
      }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(0)
    expect(dropped.duplicateFacts).toBe(1)
  })

  it('drops a second form of the same fact within one extraction', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [
        fact('서윤', '서윤은 열일곱 살이다.', '서윤은 열일곱 살이다.'),
        fact('서윤', '서윤은 17살이다.', '서윤은 17살이다.'),
      ],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({ sourceText: '서윤은 열일곱 살이다. 서윤은 17살이다.' }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(1)
    expect(dropped.duplicateFacts).toBe(1)
  })

  it('keeps a fact whose number differs', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('서윤', '서윤은 18살이다.', '서윤은 18살이다.')],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({
        sourceText: '서윤은 18살이다.',
        existingFacts: [
          { entryId: 'e-seoyun', subjectName: '서윤', content: '서윤은 열일곱 살이다.' },
        ],
      }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(1)
    expect(dropped.duplicateFacts).toBe(0)
  })
})
