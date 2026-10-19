import { describe, expect, it } from 'vitest'
import {
  extractionToProposals,
  findFragmentCanonical,
  type Extraction,
  type ExtractionContext,
} from '@/ai/extraction'
import type { NewProposal } from '@/lib/proposal-payloads'

// Tests for the G2 rules: tail-name fragments, relations with an unknown end, planted threads
// reached by a developed mention, and the stats/dropped return shape.

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

describe('extraction G2: findFragmentCanonical', () => {
  it('returns the full character card name for a tail fragment', () => {
    expect(findFragmentCanonical('세린', 'character', ['한세린'])).toBe('한세린')
  })

  it('strips a particle before looking for the tail fragment', () => {
    expect(findFragmentCanonical('세린이', 'character', ['한세린'])).toBe('한세린')
  })

  it('returns undefined when two cards end with the fragment', () => {
    expect(findFragmentCanonical('세린', 'character', ['한세린', '김세린'])).toBeUndefined()
  })

  it('returns undefined when an exact card with the same name exists', () => {
    expect(findFragmentCanonical('세린', 'character', ['세린', '한세린'])).toBeUndefined()
  })

  it('returns undefined for a one-syllable fragment', () => {
    expect(findFragmentCanonical('린', 'character', ['한세린'])).toBeUndefined()
  })

  it('returns undefined for a prefix of a card name', () => {
    expect(findFragmentCanonical('민준', 'character', ['민준호'])).toBeUndefined()
  })

  it('returns undefined for a place kind', () => {
    expect(findFragmentCanonical('세린', 'place', ['한세린'])).toBeUndefined()
  })

  it('returns undefined when the card name has a space', () => {
    expect(findFragmentCanonical('세린', 'character', ['남궁 세린'])).toBeUndefined()
  })

  it('applies to an unknown kind', () => {
    expect(findFragmentCanonical('세린', undefined, ['한세린'])).toBe('한세린')
  })

  it('returns undefined when the card name is more than two syllables longer', () => {
    expect(findFragmentCanonical('은하', 'character', ['시계탑 노은하'])).toBeUndefined()
  })
})

describe('extraction G2: tail-name fragments', () => {
  it('a character entry that is the tail of a wiki card name is not created again', () => {
    const x: Extraction = { ...emptyExtraction, entries: [entry('세린')] }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e-han', name: '한세린', aliases: [], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
  })

  it('a fact on a tail fragment binds to the wiki card with its full name', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('세린')],
      facts: [factOf('세린')],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e-han', name: '한세린', aliases: [], kind: 'character' }],
    })
    const { proposals, stats } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
    const facts = byType(proposals, 'fact_create')
    expect(facts).toHaveLength(1)
    expect(facts[0].payload.subjectName).toBe('한세린')
    expect(facts[0].payload.entryId).toBe('e-han')
    expect(stats.fragmentNamesFixed).toBeGreaterThanOrEqual(1)
  })

  it('a fact on a tail fragment of a pending card binds to the full name with no entryId', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('세린')],
      facts: [factOf('세린')],
    }
    const ctx = makeCtx({
      existingEntries: [],
      pendingEntries: [{ name: '한세린', aliases: [], kind: 'character' }],
    })
    const { proposals } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'entry_create')).toHaveLength(0)
    const facts = byType(proposals, 'fact_create')
    expect(facts[0].payload.subjectName).toBe('한세린')
    expect(facts[0].payload.entryId).toBeNull()
  })

  it('a fragment entry beside its full name in the same extraction creates only the full name', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('세린'), entry('한세린')],
      relations: [relationOf('백지원', '세린')],
    }
    const ctx = makeCtx({
      existingEntries: [{ id: 'e-baek', name: '백지원', aliases: [], kind: 'character' }],
    })
    const { proposals, stats } = extractionToProposals(x, ctx)
    const creates = byType(proposals, 'entry_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.name).toBe('한세린')
    const relations = byType(proposals, 'relation_create')
    expect(relations).toHaveLength(1)
    expect(relations[0].payload.targetName).toBe('한세린')
    expect(stats.fragmentNamesFixed).toBeGreaterThanOrEqual(1)
  })

  it('a relation end that is the tail of a wiki card name is written with the full name', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('백지원', '세린')] }
    const ctx = makeCtx({
      existingEntries: [
        { id: 'e-han', name: '한세린', aliases: [], kind: 'character' },
        { id: 'e-baek', name: '백지원', aliases: [], kind: 'character' },
      ],
    })
    const { proposals } = extractionToProposals(x, ctx)
    const relations = byType(proposals, 'relation_create')
    expect(relations).toHaveLength(1)
    expect(relations[0].payload.targetName).toBe('한세린')
  })

  it('an ambiguous fragment stays a new entry', () => {
    const x: Extraction = { ...emptyExtraction, entries: [entry('세린')] }
    const ctx = makeCtx({
      existingEntries: [
        { id: 'e-han', name: '한세린', aliases: [], kind: 'character' },
        { id: 'e-kim', name: '김세린', aliases: [], kind: 'character' },
      ],
    })
    const creates = byType(extractionToProposals(x, ctx).proposals, 'entry_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.name).toBe('세린')
  })

  it('a relation with a fragment end and no entry resolves to the wiki card', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('세린', '백지원')] }
    const ctx = makeCtx({
      existingEntries: [
        { id: 'e-han', name: '한세린', aliases: [], kind: 'character' },
        { id: 'e-baek', name: '백지원', aliases: [], kind: 'character' },
      ],
    })
    const relations = byType(extractionToProposals(x, ctx).proposals, 'relation_create')
    expect(relations).toHaveLength(1)
    expect(relations[0].payload.sourceName).toBe('한세린')
  })

  it('the place 종루 with a wiki place 잿빛 종루 stays a separate entry', () => {
    const x: Extraction = { ...emptyExtraction, entries: [entry('종루', { kind: 'place' })] }
    const ctx = makeCtx({
      existingEntries: [{ id: 'p-bell', name: '잿빛 종루', aliases: [], kind: 'place' }],
    })
    const creates = byType(extractionToProposals(x, ctx).proposals, 'entry_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.name).toBe('종루')
  })

  it('a same-extraction surname pair merges into the longer name', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('서윤'), entry('김서윤')],
    }
    const creates = byType(
      extractionToProposals(x, makeCtx({ existingEntries: [] })).proposals,
      'entry_create',
    )
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.name).toBe('김서윤')
  })

  it('an alias merge keeps the relation end that the alias names', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [entry('도훈', { aliases: ['한시우'] })],
      relations: [relationOf('도훈', '백지원')],
    }
    const ctx = makeCtx({
      existingEntries: [
        { id: 'e-siwoo', name: '한시우', aliases: [], kind: 'character' },
        { id: 'e-baek', name: '백지원', aliases: [], kind: 'character' },
      ],
    })
    const { proposals, stats } = extractionToProposals(x, ctx)
    const updates = byType(proposals, 'entry_update')
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toEqual({
      entryId: 'e-siwoo',
      entryName: '한시우',
      patch: { aliases: ['도훈'] },
    })
    expect(byType(proposals, 'relation_create')).toHaveLength(1)
    expect(stats.relationsDropped).toBe(0)
  })
})

describe('extraction G2: relations with an unknown end', () => {
  it('a relation whose target matches no card is not proposed', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('서윤', '민준')] }
    const { proposals, stats } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'relation_create')).toHaveLength(0)
    expect(stats.relationsDropped).toBe(1)
  })

  it('a relation whose source matches no card is not proposed', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('민준', '서윤')] }
    const { proposals, stats } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'relation_create')).toHaveLength(0)
    expect(stats.relationsDropped).toBe(1)
  })

  it('a relation with no card at either end is not proposed', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('민준', '지후')] }
    const { proposals, stats } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'relation_create')).toHaveLength(0)
    expect(stats.relationsDropped).toBe(1)
  })

  it('a relation whose end is a pending card is kept', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('서윤', '민준')] }
    const ctx = makeCtx({
      pendingEntries: [{ name: '민준', aliases: [], kind: 'character' }],
    })
    const { proposals, stats } = extractionToProposals(x, ctx)
    const relations = byType(proposals, 'relation_create')
    expect(relations).toHaveLength(1)
    expect(relations[0].payload.targetName).toBe('민준')
    expect(stats.relationsDropped).toBe(0)
  })

  it('a relation whose end is created in the same extraction is kept, in either list order', () => {
    const relation = relationOf('서윤', '지후')
    const entryFirst: Extraction = {
      ...emptyExtraction,
      entries: [entry('지후')],
      relations: [relation],
    }
    const relationFirst: Extraction = {
      ...emptyExtraction,
      relations: [relation],
      entries: [entry('지후')],
    }
    for (const x of [entryFirst, relationFirst]) {
      const { proposals, stats } = extractionToProposals(x, makeCtx())
      expect(byType(proposals, 'relation_create')).toHaveLength(1)
      expect(stats.relationsDropped).toBe(0)
    }
  })

  it('a relation with a role-word end is dropped but is not counted as an unknown end', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('그녀', '서윤')] }
    const { proposals, stats } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'relation_create')).toHaveLength(0)
    expect(stats.relationsDropped).toBe(0)
  })

  it('a truncated place end is dropped, not rewritten', () => {
    const x: Extraction = { ...emptyExtraction, relations: [relationOf('종루', '백지원')] }
    const ctx = makeCtx({
      existingEntries: [
        { id: 'p-bell', name: '잿빛 종루', aliases: [], kind: 'place' },
        { id: 'e-baek', name: '백지원', aliases: [], kind: 'character' },
      ],
    })
    const { proposals, stats } = extractionToProposals(x, ctx)
    expect(byType(proposals, 'relation_create')).toHaveLength(0)
    expect(stats.relationsDropped).toBe(1)
  })
})

describe('extraction G2: planted threads reached by a developed or resolved mention', () => {
  const thread = (overrides: Partial<Extraction['threads'][number]> = {}) => ({
    title: '검의 비밀',
    description: '칼집 안의 글귀',
    kind: 'developed' as const,
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

  it('a developed mention with no ref records the planting of a planned thread', () => {
    const x: Extraction = { ...emptyExtraction, threads: [thread()] }
    const { proposals } = extractionToProposals(x, plannedCtx())
    expect(byType(proposals, 'thread_create')).toHaveLength(0)
    const events = byType(proposals, 'thread_event')
    expect(events).toHaveLength(1)
    expect(events[0].payload).toMatchObject({ threadId: 't-1', kind: 'planted' })
  })

  it('a developed mention with an unknown ref records the planting of the planned thread by title', () => {
    const x: Extraction = { ...emptyExtraction, threads: [thread({ existingThreadRef: 'T9' })] }
    const { proposals } = extractionToProposals(x, plannedCtx())
    expect(byType(proposals, 'thread_create')).toHaveLength(0)
    const events = byType(proposals, 'thread_event')
    expect(events).toHaveLength(1)
    expect(events[0].payload).toMatchObject({ threadId: 't-1', kind: 'planted' })
  })

  it('a resolved mention with no ref records the planting of a planned thread', () => {
    const x: Extraction = { ...emptyExtraction, threads: [thread({ kind: 'resolved' })] }
    const { proposals } = extractionToProposals(x, plannedCtx())
    expect(byType(proposals, 'thread_create')).toHaveLength(0)
    const events = byType(proposals, 'thread_event')
    expect(events).toHaveLength(1)
    expect(events[0].payload).toMatchObject({ threadId: 't-1', kind: 'planted' })
  })

  it('a developed mention whose title matches a thread already planted is not proposed', () => {
    const x: Extraction = { ...emptyExtraction, threads: [thread()] }
    const ctx = makeCtx({
      threadRefs: new Map(),
      existingThreads: [{ id: 't-2', title: '검의 비밀', status: 'planted' }],
    })
    expect(extractionToProposals(x, ctx).proposals).toHaveLength(0)
  })

  it('an interview developed mention of a planned thread with no chapter is not proposed', () => {
    const x: Extraction = { ...emptyExtraction, threads: [thread()] }
    const ctx = plannedCtx({
      source: 'interview',
      sourceRef: 'turn-2',
      chapterId: null,
      chapterPosition: null,
    })
    expect(extractionToProposals(x, ctx).proposals).toHaveLength(0)
  })

  it('a developed mention whose title is pending as a thread still lands in pendingThreadEvents', () => {
    const x: Extraction = { ...emptyExtraction, threads: [thread()] }
    const ctx = makeCtx({
      threadRefs: new Map(),
      pendingThreadTitles: new Set(['검의 비밀']),
    })
    const { proposals, pendingThreadEvents } = extractionToProposals(x, ctx)
    expect(proposals).toHaveLength(0)
    expect(pendingThreadEvents).toEqual([
      { title: '검의 비밀', kind: 'developed', evidence: '칼집 안에 글귀가 있었다.' },
    ])
  })
})

describe('extraction G2: return shape', () => {
  it('every result has stats and a zeroed dropped object, with or without proposals', () => {
    const withProposals = extractionToProposals(
      { ...emptyExtraction, entries: [entry('노은하')] },
      makeCtx({ existingEntries: [] }),
    )
    const none = extractionToProposals(emptyExtraction, makeCtx())
    for (const result of [withProposals, none]) {
      expect(result.stats).toEqual({ fragmentNamesFixed: 0, relationsDropped: 0 })
      expect(result.dropped).toEqual({ duplicateFacts: 0, unverifiedEvidence: 0 })
    }
    expect(withProposals.proposals).toHaveLength(1)
    expect(none.proposals).toHaveLength(0)
  })
})
