import { describe, expect, it } from 'vitest'
import type { NewProposal } from '@/lib/proposal-payloads'
import { type Extraction, type ExtractionContext, extractionToProposals } from '@/ai/extraction'

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

describe('extraction: evidence verification (G1)', () => {
  it('keeps the current behavior when no sourceText is given', () => {
    const x: Extraction = { ...emptyExtraction, facts: [fact('서윤', '서윤은 검을 쓴다.', '근거')] }
    const { proposals, dropped } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'fact_create')).toHaveLength(1)
    expect(dropped.unverifiedEvidence).toBe(0)
  })

  it('drops a fact whose evidence is altered from the source', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('서윤', '4층 이상은 철문로 막혀 있었다.', '4층 이상은 철문로 막혀 있었다.')],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({ sourceText: '4층 이상은 철문으로 막혀 있었다.' }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(0)
    expect(dropped.unverifiedEvidence).toBe(1)
  })

  it('stores the source slice for whitespace-variant evidence', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('서윤', '서윤은 검을 쓴다.', '서윤은 검을 쓴다.')],
    }
    const { proposals } = extractionToProposals(x, makeCtx({ sourceText: '서윤은  검을\n쓴다.' }))
    const facts = byType(proposals, 'fact_create')
    expect(facts).toHaveLength(1)
    expect(facts[0].payload.evidence).toBe('서윤은  검을\n쓴다.')
  })

  it('drops altered thread and relation evidence and keeps the verbatim ones', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [
        { name: '민준', kind: 'character', aliases: [], summary: '', fields: [] },
        { name: '지후', kind: 'character', aliases: [], summary: '', fields: [] },
      ],
      threads: [
        {
          title: '낡은 편지',
          description: '',
          kind: 'resolved',
          evidence: '낡은 편지를 열었다.',
          existingThreadRef: 'T1',
          targetChapterPosition: null,
        },
        {
          title: '낡은 편지',
          description: '',
          kind: 'developed',
          evidence: '낡은 편지를 열렸다.',
          existingThreadRef: 'T1',
          targetChapterPosition: null,
        },
      ],
      relations: [
        {
          sourceName: '서윤',
          targetName: '민준',
          kind: '동료',
          description: '',
          evidence: '서윤과 민준은 함께 싸웠다.',
        },
        {
          sourceName: '서윤',
          targetName: '지후',
          kind: '동료',
          description: '',
          evidence: '서윤과 지후는 함께 싸웠다.',
        },
      ],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({ sourceText: '낡은 편지를 열었다. 서윤과 민준은 함께 싸웠다.' }),
    )
    expect(byType(proposals, 'thread_event')).toHaveLength(1)
    expect(byType(proposals, 'thread_event')[0].payload.kind).toBe('resolved')
    expect(byType(proposals, 'relation_create')).toHaveLength(1)
    expect(dropped.unverifiedEvidence).toBe(2)
  })

  it('drops a planned-thread planting whose evidence is not in the source', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [
        {
          title: '낡은 편지',
          description: '',
          kind: 'planted',
          evidence: '편지가 있었다.',
          existingThreadRef: 'T1',
          targetChapterPosition: null,
        },
      ],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({
        sourceText: '서윤은 말이 없었다.',
        threadRefs: new Map([['T1', { id: 't-1', title: '낡은 편지', status: 'planned' }]]),
      }),
    )
    expect(byType(proposals, 'thread_event')).toHaveLength(0)
    expect(dropped.unverifiedEvidence).toBe(1)
  })

  it('drops a near-duplicate of an existing fact on the same card', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('서윤', '서윤은  검을 쓴다', '서윤은 검을 쓴다.')],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({
        sourceText: '서윤은 검을 쓴다.',
        existingFacts: [{ entryId: 'e-seoyun', subjectName: '서윤', content: '서윤은 검을 쓴다.' }],
      }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(0)
    expect(dropped.duplicateFacts).toBe(1)
  })

  it('keeps the same content on another card', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('서윤', '서윤은 검을 쓴다.', '서윤은 검을 쓴다.')],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({
        sourceText: '서윤은 검을 쓴다.',
        existingFacts: [{ entryId: 'e-other', subjectName: '민준', content: '서윤은 검을 쓴다.' }],
      }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(1)
    expect(dropped.duplicateFacts).toBe(0)
  })

  it('never treats a supersede as a duplicate', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('서윤', '서윤은 검을 쓴다.', '서윤은 검을 쓴다.', 'F1')],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({
        sourceText: '서윤은 검을 쓴다.',
        existingFacts: [{ entryId: 'e-seoyun', subjectName: '서윤', content: '서윤은 검을 쓴다.' }],
      }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(1)
    expect(dropped.duplicateFacts).toBe(0)
  })

  it('dedupes a fact against a pending entry card by subject name', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('한세린', '한세린은 종루에 산다.', '한세린은 종루에 산다.')],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({
        sourceText: '한세린은 종루에 산다.',
        pendingEntries: [{ name: '한세린', aliases: [], kind: 'character' }],
        existingFacts: [{ entryId: null, subjectName: '한세린', content: '한세린은 종루에 산다.' }],
      }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(0)
    expect(dropped.duplicateFacts).toBe(1)
  })

  it('does not let a fact dropped for evidence block a later valid duplicate', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [
        fact('서윤', '서윤은 검을 쓴다.', '서윤은 칼을 쓴다.'),
        fact('서윤', '서윤은 검을 쓴다.', '서윤은 검을 쓴다.'),
      ],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({ sourceText: '서윤은 검을 쓴다.' }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(1)
    expect(dropped.unverifiedEvidence).toBe(1)
  })

  it('drops a near-duplicate fact within one extraction and keeps distinct facts', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [
        fact('서윤', '종루의 종은 밤마다 떨린다.', '종루의 종은 밤마다 떨린다.'),
        fact('서윤', '종루의 종은 밤마다 떨린다고 한다.', '종루의 종은 밤마다 떨린다고 한다.'),
        fact('서윤', '서윤은 검을 쓴다.', '서윤은 검을 쓴다.'),
        fact('서윤', '서윤은 검을 쓰지 못한다.', '서윤은 검을 쓰지 못한다.'),
      ],
    }
    const { proposals, dropped } = extractionToProposals(
      x,
      makeCtx({
        sourceText:
          '종루의 종은 밤마다 떨린다. 종루의 종은 밤마다 떨린다고 한다. 서윤은 검을 쓴다. 서윤은 검을 쓰지 못한다.',
      }),
    )
    expect(byType(proposals, 'fact_create')).toHaveLength(3)
    expect(dropped.duplicateFacts).toBe(1)
  })

  it('returns zeroed dropped counters and untouched stats when nothing is dropped', () => {
    const x: Extraction = { ...emptyExtraction, facts: [fact('서윤', '서윤은 검을 쓴다.', '근거')] }
    const result = extractionToProposals(x, makeCtx())
    expect(result.dropped).toEqual({ duplicateFacts: 0, unverifiedEvidence: 0 })
    expect(result.stats).toEqual({ fragmentNamesFixed: 0, relationsDropped: 0 })
  })
})
