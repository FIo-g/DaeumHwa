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

describe('extraction: planted threads, name matching and existing relations', () => {
  const plantedThread = (overrides: Partial<Extraction['threads'][number]> = {}) => ({
    title: '검의 비밀',
    description: '칼집 안의 글귀',
    kind: 'planted' as const,
    evidence: '칼집 안에 글귀가 있었다.',
    existingThreadRef: null,
    targetChapterPosition: null,
    ...overrides,
  })
  const plannedCtx = (over: Partial<ExtractionContext> = {}) =>
    makeCtx({
      threadRefs: new Map([['T1', { id: 't-1', title: '검의 비밀', status: 'planned' }]]),
      existingThreads: [{ id: 't-1', title: '검의 비밀', status: 'planned' }],
      ...over,
    })

  it('a chapter that plants an interview-planned thread by ref gives one planted event, no thread_create', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [plantedThread({ existingThreadRef: 'T1' })],
    }
    const { proposals } = extractionToProposals(x, plannedCtx())
    expect(byType(proposals, 'thread_create')).toHaveLength(0)
    const events = byType(proposals, 'thread_event')
    expect(events).toHaveLength(1)
    expect(events[0].payload).toMatchObject({
      threadId: 't-1',
      threadTitle: '검의 비밀',
      kind: 'planted',
      chapterId: 'ch-5',
    })
  })

  it('a developed mention of an interview-planned thread is recorded as the planting', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [plantedThread({ kind: 'developed', existingThreadRef: 'T1' })],
    }
    const { proposals } = extractionToProposals(x, plannedCtx())
    const events = byType(proposals, 'thread_event')
    expect(events).toHaveLength(1)
    expect(events[0].payload.kind).toBe('planted')
  })

  it('a planted thread with no ref but the title of a planned thread matches it', () => {
    const x: Extraction = { ...emptyExtraction, threads: [plantedThread()] }
    const { proposals } = extractionToProposals(x, plannedCtx())
    expect(byType(proposals, 'thread_create')).toHaveLength(0)
    expect(byType(proposals, 'thread_event')).toHaveLength(1)
    expect(byType(proposals, 'thread_event')[0].payload).toMatchObject({
      threadId: 't-1',
      kind: 'planted',
    })
  })

  it('a planted thread whose title matches an already planted thread produces nothing', () => {
    const x: Extraction = { ...emptyExtraction, threads: [plantedThread()] }
    const ctx = makeCtx({
      threadRefs: new Map(),
      existingThreads: [{ id: 't-2', title: '검의 비밀', status: 'developing' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(proposals).toHaveLength(0)
  })

  it('an interview that repeats an existing thread title creates no thread_create', () => {
    const x: Extraction = { ...emptyExtraction, threads: [plantedThread()] }
    const ctx = makeCtx({
      source: 'interview',
      sourceRef: 'turn-2',
      chapterId: null,
      chapterPosition: null,
      threadRefs: new Map(),
      existingThreads: [{ id: 't-3', title: '검의 비밀', status: 'planted' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'thread_create')).toHaveLength(0)
  })

  it('a new entry that differs from an existing name only by its last syllable is a new entry', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [{ name: '김서은', kind: 'character', aliases: [], summary: '', fields: [] }],
      facts: [
        {
          subjectName: '김서은',
          content: '왼손잡이다.',
          evidence: '',
          suggestedStatus: 'confirmed',
          supersedesFactRef: null,
        },
      ],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e-seoa', name: '김서아', aliases: [], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    const entries = byType(proposals, 'entry_create')
    expect(entries).toHaveLength(1)
    expect(entries[0].payload.name).toBe('김서은')
    const facts = byType(proposals, 'fact_create')
    expect(facts).toHaveLength(1)
    expect(facts[0].payload.entryId).toBeNull()
  })

  it('a particle on an incoming name still matches the existing card it names', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [
        {
          subjectName: '김서아가',
          content: '왼손잡이다.',
          evidence: '',
          suggestedStatus: 'confirmed',
          supersedesFactRef: null,
        },
      ],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e-seoa', name: '김서아', aliases: [], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'fact_create')[0].payload.entryId).toBe('e-seoa')
  })

  it('two new entries that share a stem keep both entries and both facts', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [
        { name: '김서아', kind: 'character', aliases: [], summary: '', fields: [] },
        { name: '김서은', kind: 'character', aliases: [], summary: '', fields: [] },
      ],
      facts: [
        {
          subjectName: '김서아',
          content: '왼손잡이다.',
          evidence: '',
          suggestedStatus: 'confirmed',
          supersedesFactRef: null,
        },
        {
          subjectName: '김서은',
          content: '왼손잡이다.',
          evidence: '',
          suggestedStatus: 'confirmed',
          supersedesFactRef: null,
        },
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx({ existingEntries: [] }))
    expect(byType(proposals, 'entry_create')).toHaveLength(2)
    expect(byType(proposals, 'fact_create')).toHaveLength(2)
  })

  it('an alias-form entry after its name in the same extraction is still skipped', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [
        { name: '하윤', kind: 'character', aliases: [], summary: '', fields: [] },
        { name: '하윤이', kind: 'character', aliases: [], summary: '', fields: [] },
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx({ existingEntries: [] }))
    expect(byType(proposals, 'entry_create')).toHaveLength(1)
  })

  const relationOf = (sourceName: string, targetName: string) => ({
    sourceName,
    targetName,
    kind: '동료',
    description: '',
    evidence: '',
  })
  const wiki = [
    { id: 'e-seoa', name: '김서아', aliases: [], kind: 'character' as const },
    { id: 'e-minjun', name: '민준', aliases: [], kind: 'character' as const },
  ]

  it('two different new relations of the same kind are both proposed', () => {
    const x: Extraction = {
      ...emptyExtraction,
      relations: [relationOf('김서아', '민준'), relationOf('김서은', '민준')],
    }
    const { proposals } = extractionToProposals(x, makeCtx({ existingEntries: wiki }))
    expect(byType(proposals, 'relation_create')).toHaveLength(2)
  })

  it('a relation the wiki already has, open and in either direction, is not proposed again', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('민준', '김서아')] }
    const ctx = makeCtx({
      existingEntries: wiki,
      existingRelations: [
        {
          sourceId: 'e-seoa',
          targetId: 'e-minjun',
          kind: '동료',
          directed: false,
          endPosition: null,
        },
      ],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'relation_create')).toHaveLength(0)
  })

  it('a relation that ended before this chapter does not block a new one', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('김서아', '민준')] }
    const ctx = makeCtx({
      existingEntries: wiki,
      existingRelations: [
        {
          sourceId: 'e-seoa',
          targetId: 'e-minjun',
          kind: '동료',
          directed: false,
          endPosition: 2,
        },
      ],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'relation_create')).toHaveLength(1)
  })
})

describe('extraction: dedup and naming rules', () => {
  const entry = (name: string, extra: Partial<Extraction['entries'][number]> = {}) => ({
    name,
    kind: 'character' as const,
    aliases: [],
    summary: '',
    fields: [],
    ...extra,
  })
  const factOf = (subjectName: string, content = '왼손잡이다.') => ({
    subjectName,
    content,
    evidence: '',
    suggestedStatus: 'confirmed' as const,
    supersedesFactRef: null,
  })
  const relationOf = (sourceName: string, targetName: string) => ({
    sourceName,
    targetName,
    kind: '동료',
    description: '',
    evidence: '',
  })

  it('a name that is already pending as entry_create is not created again', () => {
    const x: Extraction = { ...emptyExtraction, entries: [entry('노은하')] }
    const ctx = makeCtx({
      existingEntries: [],
      pendingEntries: [{ name: '노은하', aliases: [] }],
    })
    expect(byType(extractionToProposals(x, ctx).proposals, 'entry_create')).toHaveLength(0)
  })

  it('an incoming alias that equals an existing card adds the new name as an alias', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('한시우', { aliases: ['백도윤'] })],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e1', name: '백도윤', aliases: [], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
    const updates = byType(proposals, 'entry_update')
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toEqual({
      entryId: 'e1',
      entryName: '백도윤',
      patch: { aliases: ['한시우'] },
    })
  })

  it('a long character name with a title in front matches the existing card by its last word', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('시계탑 수리공 노은하')],
      facts: [factOf('전직 시계탑 수리공 노은하')],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e2', name: '노은하', aliases: [], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
    expect(byType(proposals, 'entry_update')).toHaveLength(0)
    expect(byType(proposals, 'fact_create')[0].payload.entryId).toBe('e2')
  })

  it('role words used as names are not created, with or without a particle', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('주인공'), entry('주인공은')],
    }
    const { proposals } = extractionToProposals(x, makeCtx({ existingEntries: [] }))
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
  })

  it('a fact whose subject is a role word is dropped, and a relation with a role-word end is dropped', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [factOf('주인공')],
      relations: [relationOf('그녀', '한시우')],
    }
    const { proposals } = extractionToProposals(x, makeCtx({ existingEntries: [] }))
    expect(byType(proposals, 'fact_create')).toHaveLength(0)
    expect(byType(proposals, 'relation_create')).toHaveLength(0)
  })

  it('a long place name is not merged into a place card by its last word', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('북쪽 시계탑', { kind: 'place' })],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'p1', name: '시계탑', aliases: [], kind: 'place' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    const creates = byType(proposals, 'entry_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.name).toBe('북쪽 시계탑')
  })

  it('a long name that matches by last word adds no alias to the existing card', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('시계탑 수리공 노은하')],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e2', name: '노은하', aliases: [], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(proposals).toHaveLength(0)
  })

  it('one answer that names 노은하 and 전직 시계탑 수리공 노은하 yields exactly one card', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [
        entry('노은하'),
        entry('전직 시계탑 수리공 노은하', { summary: '전직 시계탑 수리공' }),
      ],
    }
    const { proposals } = extractionToProposals(x, makeCtx({ existingEntries: [] }))
    const creates = byType(proposals, 'entry_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.name).toBe('노은하')
  })

  it('a fact about a pending entry name has no entryId', () => {
    const x: Extraction = { ...emptyExtraction, facts: [factOf('노은하')] }
    const ctx = makeCtx({
      existingEntries: [],
      pendingEntries: [{ name: '노은하', aliases: [] }],
    })
    const facts = byType(extractionToProposals(x, ctx).proposals, 'fact_create')
    expect(facts).toHaveLength(1)
    expect(facts[0].payload.entryId).toBeNull()
  })

  it('a planted thread whose title is already pending as thread_create is not created again', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [
        {
          title: '멈춘 종의 비밀',
          description: '',
          kind: 'planted',
          evidence: '',
          existingThreadRef: null,
          targetChapterPosition: null,
        },
      ],
    }
    const pendingCtx = makeCtx({
      pendingThreadCreateTitles: new Set(['멈춘 종의 비밀']),
    })
    expect(byType(extractionToProposals(x, pendingCtx).proposals, 'thread_create')).toHaveLength(0)

    const existingCtx = makeCtx({
      existingThreads: [{ id: 't-9', title: '멈춘 종의 비밀', status: 'planned' }],
    })
    expect(byType(extractionToProposals(x, existingCtx).proposals, 'thread_create')).toHaveLength(0)
  })

  it('a long name listed before the bare name in one answer yields exactly one card', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('전직 시계탑 수리공 노은하'), entry('노은하')],
    }
    const creates = byType(
      extractionToProposals(x, makeCtx({ existingEntries: [] })).proposals,
      'entry_create',
    )
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.name).toBe('전직 시계탑 수리공 노은하')
  })

  it('a bare name merges into a pending long name', () => {
    const x: Extraction = { ...emptyExtraction, entries: [entry('노은하')] }
    const ctx = makeCtx({
      existingEntries: [],
      pendingEntries: [{ name: '전직 시계탑 수리공 노은하', aliases: [], kind: 'character' }],
    })
    expect(byType(extractionToProposals(x, ctx).proposals, 'entry_create')).toHaveLength(0)
  })

  it('a bare name merges into a wiki long name, and the fact uses the card name', () => {
    const x: Extraction = { ...emptyExtraction, facts: [factOf('노은하')] }
    const ctx = makeCtx({
      existingEntries: [
        { id: 'e-eunha', name: '전직 시계탑 수리공 노은하', aliases: [], kind: 'character' },
      ],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
    const facts = byType(proposals, 'fact_create')
    expect(facts[0].payload.entryId).toBe('e-eunha')
    expect(facts[0].payload.subjectName).toBe('전직 시계탑 수리공 노은하')
  })

  it('a bare last word does not merge into a place whose name ends with it', () => {
    const x: Extraction = { ...emptyExtraction, entries: [entry('시계탑', { kind: 'place' })] }
    const ctx = makeCtx({
      existingEntries: [{ id: 'p1', name: '북쪽 시계탑', aliases: [], kind: 'place' }],
    })
    const creates = byType(extractionToProposals(x, ctx).proposals, 'entry_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.name).toBe('시계탑')
  })

  it('a relation names the card, not the long form it was written with', () => {
    const x: Extraction = {
      ...emptyExtraction,
      relations: [relationOf('전직 시계탑 수리공 노은하', '한시우')],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e-eunha', name: '노은하', aliases: [], kind: 'character' }],
    })
    const relations = byType(extractionToProposals(x, ctx).proposals, 'relation_create')
    expect(relations).toHaveLength(1)
    expect(relations[0].payload.sourceName).toBe('노은하')
    expect(relations[0].payload.targetName).toBe('한시우')
  })

  it('a relation with a particle-marked name on a pending card names the pending card', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('노은하에게는', '한시우')] }
    const ctx = makeCtx({
      existingEntries: [],
      pendingEntries: [{ name: '전직 시계탑 수리공 노은하', aliases: [], kind: 'character' }],
    })
    const relations = byType(extractionToProposals(x, ctx).proposals, 'relation_create')
    expect(relations[0].payload.sourceName).toBe('전직 시계탑 수리공 노은하')
  })

  it('a fact about an alias that matched a pending card binds to that card name', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('시우', { aliases: ['한시우'] })],
      facts: [factOf('시우')],
    }
    const ctx = makeCtx({
      existingEntries: [],
      pendingEntries: [{ name: '한시우', aliases: [], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
    const facts = byType(proposals, 'fact_create')
    expect(facts[0].payload.subjectName).toBe('한시우')
    expect(facts[0].payload.entryId).toBeNull()
  })

  it('an alias that is a long name matched only by its last word does not merge the entry', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('한시우', { aliases: ['시계탑 수리공 노은하'] })],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e2', name: '노은하', aliases: [], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'entry_update')).toHaveLength(0)
    const creates = byType(proposals, 'entry_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.name).toBe('한시우')
  })

  it('a role word alias does not merge the entry into a card that carries the same alias', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('한시우', { aliases: ['주인공'] })],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e1', name: '백도윤', aliases: ['주인공'], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'entry_update')).toHaveLength(0)
    const creates = byType(proposals, 'entry_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.aliases).toEqual([])
  })
})
