import { describe, expect, it } from 'vitest'
import { parseProposalPayload, type NewProposal } from '@/lib/proposal-payloads'
import {
  ExtractionSchema,
  extractionToProposals,
  type Extraction,
  type ExtractionContext,
} from '@/ai/extraction'

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

describe('extraction: ExtractionSchema', () => {
  it('accepts a complete extraction and rejects an unknown entry kind', () => {
    const ok = ExtractionSchema.safeParse({
      summary: null,
      entries: [
        {
          name: '민준',
          kind: 'character',
          aliases: [],
          summary: '주인공',
          fields: [{ key: '나이', value: '17' }],
        },
      ],
      facts: [],
      threads: [],
      relations: [],
    })
    expect(ok.success).toBe(true)

    const bad = ExtractionSchema.safeParse({
      ...emptyExtraction,
      entries: [{ name: 'x', kind: 'spaceship', aliases: [], summary: '', fields: [] }],
    })
    expect(bad.success).toBe(false)
  })
})

describe('extraction: extractionToProposals', () => {
  it('existing name match skips entry_create but keeps the fact with entryId', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [{ name: '서윤이', kind: 'character', aliases: [], summary: '', fields: [] }],
      facts: [
        {
          subjectName: '서윤이',
          content: '서윤은 검을 쓴다',
          evidence: '서윤은 검을 쓴다.',
          suggestedStatus: 'confirmed',
          supersedesFactRef: null,
        },
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
    const facts = byType(proposals, 'fact_create')
    expect(facts).toHaveLength(1)
    expect(facts[0].payload.entryId).toBe('e-seoyun')
    expect(facts[0].payload.sourceChapterId).toBe('ch-5')
    expect(facts[0].payload.supersedesFactId).toBeNull()
  })

  it('alias match also counts as an existing entry', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [{ name: '윤', kind: 'character', aliases: [], summary: '', fields: [] }],
    }
    const { proposals } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
  })

  it('new entry becomes entry_create with a fields record and cleaned aliases', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [
        {
          name: '  민준 ',
          kind: 'character',
          aliases: [' 준 ', '', '  '],
          summary: ' 주인공 ',
          fields: [
            { key: '나이', value: '17' },
            { key: '', value: 'ignored' },
          ],
        },
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx())
    const entries = byType(proposals, 'entry_create')
    expect(entries).toHaveLength(1)
    expect(entries[0].payload).toEqual({
      kind: 'character',
      name: '민준',
      aliases: ['준'],
      summary: '주인공',
      fields: { 나이: '17' },
    })
    expect(entries[0].source).toBe('post_chapter')
    expect(entries[0].sourceRef).toBe('chapter-ref-5')
    expect(entries[0].chapterId).toBe('ch-5')
  })

  it('duplicate entries with the same name are merged into one entry_create', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [
        { name: '민준', kind: 'character', aliases: [], summary: '', fields: [] },
        { name: '민준', kind: 'character', aliases: [], summary: '다른 설명', fields: [] },
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'entry_create')).toHaveLength(1)
  })

  it('unknown thread ref is dropped when no pending title matches', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [
        {
          title: '새 떡밥',
          description: '설명',
          kind: 'developed',
          evidence: '근거',
          existingThreadRef: 'T9',
          targetChapterPosition: null,
        },
      ],
    }
    const result = extractionToProposals(x, makeCtx())
    expect(byType(result.proposals, 'thread_event')).toHaveLength(0)
    expect(byType(result.proposals, 'thread_create')).toHaveLength(0)
    expect(result.pendingThreadEvents).toEqual([])
  })

  it('known thread ref becomes thread_event with the thread id and title', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [
        {
          title: '낡은 편지',
          description: '편지가 열림',
          kind: 'resolved',
          evidence: '편지를 열었다.',
          existingThreadRef: 'T1',
          targetChapterPosition: null,
        },
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx())
    const events = byType(proposals, 'thread_event')
    expect(events).toHaveLength(1)
    expect(events[0].payload).toMatchObject({
      threadId: 't-1',
      threadTitle: '낡은 편지',
      kind: 'resolved',
      chapterId: 'ch-5',
      note: '편지가 열림',
      evidence: '편지를 열었다.',
    })
  })

  it('unknown ref with a title in pendingThreadTitles goes to pendingThreadEvents', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [
        {
          title: ' 새 떡밥 ',
          description: '설명',
          kind: 'developed',
          evidence: '근거',
          existingThreadRef: null,
          targetChapterPosition: null,
        },
      ],
    }
    const result = extractionToProposals(x, makeCtx({ pendingThreadTitles: new Set(['새 떡밥']) }))
    expect(byType(result.proposals, 'thread_event')).toHaveLength(0)
    expect(result.pendingThreadEvents).toEqual([
      { title: '새 떡밥', kind: 'developed', evidence: '근거' },
    ])
  })

  it('planted thread from an interview is thread_create with status planned', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [
        {
          title: '숨겨진 열쇠',
          description: '왕궁 지하의 열쇠',
          kind: 'planted',
          evidence: '열쇠는 지하에 있다.',
          existingThreadRef: null,
          targetChapterPosition: 12,
        },
      ],
    }
    const { proposals } = extractionToProposals(
      x,
      makeCtx({ source: 'interview', sourceRef: 'turn-1', chapterId: null, chapterPosition: null }),
    )
    const creates = byType(proposals, 'thread_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload).toMatchObject({
      title: '숨겨진 열쇠',
      description: '왕궁 지하의 열쇠',
      status: 'planned',
      plantedChapterId: null,
      targetChapterPosition: 12,
      events: [],
    })
    expect(creates[0].source).toBe('interview')
    expect(creates[0].sourceRef).toBe('turn-1')
  })

  it('planted thread from a chapter is thread_create with status planted and plantedChapterId', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [
        {
          title: '숨겨진 열쇠',
          description: '설명',
          kind: 'planted',
          evidence: '근거',
          existingThreadRef: null,
          targetChapterPosition: null,
        },
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx())
    const creates = byType(proposals, 'thread_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.status).toBe('planted')
    expect(creates[0].payload.plantedChapterId).toBe('ch-5')
  })

  it('relation becomes an undirected relation_create starting at the chapter position', () => {
    const x: Extraction = {
      ...emptyExtraction,
      relations: [
        {
          sourceName: '서윤',
          targetName: '민준',
          kind: ' 동료 ',
          description: '함께 싸운다',
          evidence: '둘은 함께 싸웠다.',
        },
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx())
    const rels = byType(proposals, 'relation_create')
    expect(rels).toHaveLength(1)
    expect(rels[0].payload).toEqual({
      sourceName: '서윤',
      targetName: '민준',
      kind: '동료',
      description: '함께 싸운다',
      directed: false,
      startPosition: 5,
      evidence: '둘은 함께 싸웠다.',
    })
  })

  it('summary becomes chapter_summary only when a chapterId exists', () => {
    const x: Extraction = { ...emptyExtraction, summary: '서윤이 편지를 열었다.' }

    const withChapter = extractionToProposals(x, makeCtx()).proposals
    const summaries = byType(withChapter, 'chapter_summary')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].payload).toEqual({ chapterId: 'ch-5', summary: '서윤이 편지를 열었다.' })

    const noChapter = extractionToProposals(
      x,
      makeCtx({ source: 'interview', chapterId: null, chapterPosition: null }),
    ).proposals
    expect(byType(noChapter, 'chapter_summary')).toHaveLength(0)
  })

  it('blank summary produces no chapter_summary', () => {
    const x: Extraction = { ...emptyExtraction, summary: '   ' }
    const { proposals } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'chapter_summary')).toHaveLength(0)
  })

  it('duplicate facts are deduped by subject and normalized content', () => {
    const fact = {
      subjectName: '서윤',
      content: '서윤은  검을 쓴다',
      evidence: '근거',
      suggestedStatus: 'assumed' as const,
      supersedesFactRef: null,
    }
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact, { ...fact, content: '서윤은 검을 쓴다 ', evidence: '다른 근거' }],
    }
    const { proposals } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'fact_create')).toHaveLength(1)
  })

  it('fact supersedesFactRef resolves through factRefs, unknown refs become null', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [
        {
          subjectName: '서윤',
          content: '서윤은 활을 쓴다',
          evidence: '근거',
          suggestedStatus: 'confirmed',
          supersedesFactRef: 'F1',
        },
        {
          subjectName: '민준',
          content: '민준은 말을 탄다',
          evidence: '근거',
          suggestedStatus: 'undecided',
          supersedesFactRef: 'F404',
        },
      ],
    }
    const facts = byType(extractionToProposals(x, makeCtx()).proposals, 'fact_create')
    expect(facts.map((f) => f.payload.supersedesFactId)).toEqual(['f-1', null])
    expect(facts[1].payload.entryId).toBeNull()
  })

  it('fact with blank content is dropped', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [
        {
          subjectName: '서윤',
          content: '  ',
          evidence: '근거',
          suggestedStatus: 'confirmed',
          supersedesFactRef: null,
        },
      ],
    }
    expect(byType(extractionToProposals(x, makeCtx()).proposals, 'fact_create')).toHaveLength(0)
  })

  it('every produced payload passes parseProposalPayload', () => {
    const x: Extraction = {
      summary: '요약',
      entries: [
        {
          name: '민준',
          kind: 'character',
          aliases: ['준'],
          summary: '주인공',
          fields: [{ key: 'a', value: 'b' }],
        },
      ],
      facts: [
        {
          subjectName: '민준',
          content: '민준은 17살이다',
          evidence: '17살',
          suggestedStatus: 'confirmed',
          supersedesFactRef: 'F1',
        },
      ],
      threads: [
        {
          title: '새 떡밥',
          description: '설명',
          kind: 'planted',
          evidence: '근거',
          existingThreadRef: null,
          targetChapterPosition: 9,
        },
        {
          title: '낡은 편지',
          description: '열림',
          kind: 'developed',
          evidence: '근거',
          existingThreadRef: 'T1',
          targetChapterPosition: null,
        },
      ],
      relations: [
        {
          sourceName: '서윤',
          targetName: '민준',
          kind: '동료',
          description: '설명',
          evidence: '근거',
        },
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx())
    expect(proposals.length).toBeGreaterThan(0)
    for (const p of proposals) {
      expect(() => parseProposalPayload(p.type, p.payload)).not.toThrow()
    }
  })
})
