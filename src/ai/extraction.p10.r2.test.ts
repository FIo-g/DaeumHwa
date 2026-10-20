import { describe, expect, it } from 'vitest'
import type { NewProposal } from '@/lib/proposal-payloads'
import { type Extraction, type ExtractionContext, extractionToProposals } from '@/ai/extraction'

// Round 2, P10: the evidence-anchor counters of the extraction mapper. Count mode never changes
// a proposal; drop mode leaves the weak items out.

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
    existingEntries: [
      { id: 'e-seoyun', name: '서윤', aliases: ['검사'], kind: 'character' },
      { id: 'e-key', name: '은색 열쇠', aliases: [], kind: 'item' },
    ],
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

const thread = (
  title: string,
  description: string,
  kind: 'planted' | 'developed' | 'resolved',
  evidence: string,
  existingThreadRef: string | null,
): Extraction['threads'][number] => ({
  title,
  description,
  kind,
  evidence,
  existingThreadRef,
  targetChapterPosition: null,
})

// Five facts: three anchored (one through an alias, one through a head word) and two weak.
const fiveFacts: Extraction['facts'] = [
  fact('서윤', '서윤은 검을 쓴다', '서윤은 검을 쓴다.'),
  fact('서윤', '왼손잡이다', '그는 왼손으로 검을 쥐었다.'),
  fact('서윤', '검사로 불린다', '검사는 말이 없었다.'),
  fact('은색 열쇠', '은색이다', '열쇠가 번쩍였다.'),
  fact('은색 열쇠', '보름에만 맞는다', '오늘은 보름이 아니잖아요.'),
]

describe('extraction: evidence anchor counters (P10)', () => {
  it('off is the default and counts nothing', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('서윤', '왼손잡이다', '그는 왼손으로 검을 쥐었다.')],
    }
    const { proposals, weak } = extractionToProposals(x, makeCtx())
    expect(byType(proposals, 'fact_create')).toHaveLength(1)
    expect(weak).toEqual({ weakFactEvidence: 0, weakThreadEvidence: 0 })
  })

  it('count keeps every fact and counts the weak ones', () => {
    const x: Extraction = { ...emptyExtraction, facts: fiveFacts }
    const { proposals, weak } = extractionToProposals(x, makeCtx({ evidenceAnchor: 'count' }))
    expect(byType(proposals, 'fact_create')).toHaveLength(5)
    expect(weak.weakFactEvidence).toBe(2)
  })

  it('count never changes the proposals', () => {
    const x: Extraction = { ...emptyExtraction, facts: fiveFacts }
    const off = extractionToProposals(x, makeCtx({ evidenceAnchor: 'off' }))
    const count = extractionToProposals(x, makeCtx({ evidenceAnchor: 'count' }))
    expect(count.proposals).toEqual(off.proposals)
  })

  it('drop leaves the weak facts out', () => {
    const x: Extraction = { ...emptyExtraction, facts: fiveFacts }
    const { proposals, weak } = extractionToProposals(x, makeCtx({ evidenceAnchor: 'drop' }))
    expect(byType(proposals, 'fact_create')).toHaveLength(3)
    expect(weak.weakFactEvidence).toBe(2)
  })

  it('a dropped weak fact does not hide a duplicate with good evidence', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [
        fact('서윤', '왼손잡이다', '그는 왼손으로 검을 쥐었다.'),
        fact('서윤', '왼손잡이다', '서윤은 왼손잡이였다.'),
      ],
    }
    const count = extractionToProposals(x, makeCtx({ evidenceAnchor: 'count' }))
    const countFacts = byType(count.proposals, 'fact_create')
    expect(countFacts).toHaveLength(1)
    expect(countFacts[0].payload.evidence).toBe('그는 왼손으로 검을 쥐었다.')
    expect(count.weak.weakFactEvidence).toBe(1)

    const drop = extractionToProposals(x, makeCtx({ evidenceAnchor: 'drop' }))
    const dropFacts = byType(drop.proposals, 'fact_create')
    expect(dropFacts).toHaveLength(1)
    expect(dropFacts[0].payload.evidence).toBe('서윤은 왼손잡이였다.')
  })

  it('duplicates and unverified evidence are not counted as weak', () => {
    const duplicate = extractionToProposals(
      {
        ...emptyExtraction,
        facts: [fact('서윤', '서윤은 검을 쓴다', '그는 검을 쓴다.')],
      },
      makeCtx({
        evidenceAnchor: 'count',
        existingFacts: [{ entryId: 'e-seoyun', subjectName: '서윤', content: '서윤은 검을 쓴다' }],
      }),
    )
    expect(duplicate.dropped.duplicateFacts).toBe(1)
    expect(duplicate.weak.weakFactEvidence).toBe(0)

    const unverified = extractionToProposals(
      { ...emptyExtraction, facts: [fact('서윤', '서윤은 검을 쓴다', '존재하지 않는 문장')] },
      makeCtx({ evidenceAnchor: 'count', sourceText: '서윤은 검을 쓴다.' }),
    )
    expect(unverified.dropped.unverifiedEvidence).toBe(1)
    expect(unverified.weak.weakFactEvidence).toBe(0)
  })

  it('a tail name is checked as the full card', () => {
    const x: Extraction = {
      ...emptyExtraction,
      facts: [fact('세린', '왼손잡이다', '세린은 왼손으로 쥐었다.')],
    }
    const { proposals, weak, stats } = extractionToProposals(
      x,
      makeCtx({
        evidenceAnchor: 'count',
        existingEntries: [{ id: 'e-serin', name: '한세린', aliases: [], kind: 'character' }],
      }),
    )
    const facts = byType(proposals, 'fact_create')
    expect(facts[0].payload.subjectName).toBe('한세린')
    expect(weak.weakFactEvidence).toBe(0)
    expect(stats.fragmentNamesFixed).toBe(1)
  })

  it('a card created in the same extraction is checked with its aliases', () => {
    const x: Extraction = {
      ...emptyExtraction,
      entries: [
        {
          name: '백지원',
          kind: 'character',
          aliases: ['감시관'],
          summary: '감시관',
          fields: [],
        },
      ],
      facts: [
        fact('백지원', '허락 없이는 막는다', '감시관은 허락하지 않았다.'),
        fact('백지원', '규칙을 따른다', '그는 규칙을 따랐다.'),
      ],
    }
    const { proposals, weak } = extractionToProposals(x, makeCtx({ evidenceAnchor: 'count' }))
    expect(byType(proposals, 'entry_create')).toHaveLength(1)
    expect(byType(proposals, 'fact_create')).toHaveLength(2)
    expect(weak.weakFactEvidence).toBe(1)
  })

  it('threads: count and drop', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [
        thread('잠긴 서랍', '서랍은 열리지 않는다', 'planted', '서랍은 잠겨 있었다.', null),
        thread('푸른 등불', '등불이 켜졌다', 'planted', '문이 열렸다.', null),
        thread('낡은 편지', '편지가 다시 나온다', 'developed', '문이 열렸다.', 'T1'),
      ],
    }
    const count = extractionToProposals(x, makeCtx({ evidenceAnchor: 'count' }))
    expect(byType(count.proposals, 'thread_create')).toHaveLength(2)
    expect(byType(count.proposals, 'thread_event')).toHaveLength(1)
    expect(count.weak.weakThreadEvidence).toBe(2)

    const drop = extractionToProposals(x, makeCtx({ evidenceAnchor: 'drop' }))
    const creates = byType(drop.proposals, 'thread_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload.title).toBe('잠긴 서랍')
    expect(byType(drop.proposals, 'thread_event')).toHaveLength(0)
    expect(drop.weak.weakThreadEvidence).toBe(2)
  })

  it('a weak event for a pending thread', () => {
    const x: Extraction = {
      ...emptyExtraction,
      threads: [thread('푸른 등불', '등불이 다시 켜졌다', 'developed', '문이 열렸다.', null)],
    }
    const base = {
      evidenceAnchor: 'count' as const,
      pendingThreadTitles: new Set(['푸른 등불']),
    }
    const count = extractionToProposals(x, makeCtx(base))
    expect(count.pendingThreadEvents).toHaveLength(1)
    expect(count.weak.weakThreadEvidence).toBe(1)

    const drop = extractionToProposals(x, makeCtx({ ...base, evidenceAnchor: 'drop' }))
    expect(drop.pendingThreadEvents).toHaveLength(0)
    expect(drop.weak.weakThreadEvidence).toBe(1)
  })

  it('relations are not checked', () => {
    const x: Extraction = {
      ...emptyExtraction,
      relations: [
        {
          sourceName: '서윤',
          targetName: '은색 열쇠',
          kind: '소유',
          description: '서윤이 열쇠를 가진다',
          evidence: '문이 열렸다.',
        },
      ],
    }
    const { proposals, weak } = extractionToProposals(x, makeCtx({ evidenceAnchor: 'count' }))
    expect(byType(proposals, 'relation_create')).toHaveLength(1)
    expect(weak).toEqual({ weakFactEvidence: 0, weakThreadEvidence: 0 })
  })
})
