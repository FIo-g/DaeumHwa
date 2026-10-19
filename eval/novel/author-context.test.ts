import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog, wikiEntries } from '@/db/schema'
import type { Actor } from '@/db/types'
import { createRelation } from '@/server/relations'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestFact, createTestUser, createTestWork } from '@/test/factories'
import { type Pending, logDecision } from './author-io'
import {
  type AuthorContext,
  type DecisionLine,
  ENTRY_CAP,
  FACT_CAP,
  buildAuthorContext,
  countDecisionMetrics,
  normalizeKey,
  readDecisions,
  removeAuthorContext,
  writeAuthorContext,
} from './author-context'
import { pendingKey } from './steps/util'

type ProposalsPending = Extract<Pending, { kind: 'proposals' }>
type InterviewPending = Extract<Pending, { kind: 'interview_answer' }>

function proposalsPending(
  items: {
    id: string
    type: ProposalsPending['items'][number]['type']
    payload: Record<string, unknown>
  }[],
  step = 'ch1:proposals',
): ProposalsPending {
  return {
    kind: 'proposals',
    step,
    source: 'post_chapter',
    chapter: 1,
    chapterFile: 'chapters/01.md',
    items,
  }
}

function interviewPending(turnId: string): InterviewPending {
  return {
    kind: 'interview_answer',
    step: 'interview',
    turnId,
    focus: 'setting',
    topic: '도시',
    question: '도시의 성벽은 몇 겹인가요?',
    asked: 1,
    limit: 3,
  }
}

let db: Db
let actor: Actor
let workId: string
let dir: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db)
  actor = { userId: owner.id }
  workId = (await createTestWork(db, owner.id)).id
  dir = mkdtempSync(join(tmpdir(), 'author-ctx-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const decisionsPath = () => join(dir, 'author-decisions.jsonl')

describe('normalizeKey', () => {
  it('drops whitespace and punctuation and lowercases', () => {
    expect(normalizeKey('해 연')).toBe('해연')
    expect(normalizeKey('A -> B (동료)')).toBe(normalizeKey('a->b동료'))
    expect(normalizeKey('해연: 열쇠를 쥔다.')).toBe(normalizeKey('해연 열쇠를쥔다'))
  })
})

describe('readDecisions', () => {
  it('returns empty for a missing file and skips bad lines', () => {
    expect(readDecisions(dir)).toEqual([])
    const valid = { at: 'x', step: 'ch1:proposals', kind: 'proposals', answer: {} }
    writeFileSync(decisionsPath(), `${JSON.stringify(valid)}\nnot json\n\n`)
    expect(readDecisions(dir)).toHaveLength(1)
  })
})

describe('buildAuthorContext wiki', () => {
  it('gives an empty wiki for a new work, with empty hints', async () => {
    const pending = proposalsPending([{ id: 'a', type: 'entry_create', payload: { name: '해연' } }])
    const context = await buildAuthorContext(db, actor, workId, dir, pending)
    expect(context.wiki.entries).toEqual([])
    expect(context.wiki.truncated).toBe(false)
    expect(context.hints).toEqual({})
  })

  it('gives empty hints for an interview pending', async () => {
    const context = await buildAuthorContext(db, actor, workId, dir, interviewPending('t1'))
    expect(context.hints).toEqual({})
  })

  it('lists active cards with their facts and hides archived ones', async () => {
    const a = await createTestEntry(db, workId, { name: '해연' })
    const b = await createTestEntry(db, workId, { name: '세린' })
    await createTestFact(db, workId, { content: '열쇠를 쥔다', entryId: a.id })
    await createTestFact(db, workId, { content: '종루에 산다', entryId: a.id })
    await db.update(wikiEntries).set({ archivedAt: new Date() }).where(eq(wikiEntries.id, b.id))

    const context = await buildAuthorContext(db, actor, workId, dir, interviewPending('t1'))
    expect(context.wiki.entries.map((entry) => entry.name)).toEqual(['해연'])
    expect(context.wiki.entries[0].facts.map((fact) => fact.content).sort()).toEqual([
      '열쇠를 쥔다',
      '종루에 산다',
    ])
    expect(JSON.stringify(context)).not.toContain('세린')
  })

  it('drops relations whose endpoint card is archived', async () => {
    const a = await createTestEntry(db, workId, { name: '해연' })
    const b = await createTestEntry(db, workId, { name: '세린' })
    const c = await createTestEntry(db, workId, { name: '백지원' })
    await createRelation(db, actor, {
      workId,
      sourceEntryId: a.id,
      targetEntryId: c.id,
      kind: '동료',
    })
    await createRelation(db, actor, {
      workId,
      sourceEntryId: a.id,
      targetEntryId: b.id,
      kind: '가족',
    })
    await db.update(wikiEntries).set({ archivedAt: new Date() }).where(eq(wikiEntries.id, b.id))

    const context = await buildAuthorContext(db, actor, workId, dir, interviewPending('t1'))
    expect(context.wiki.relations).toEqual([{ source: '해연', target: '백지원', kind: '동료' }])
  })

  it('caps entries and facts and sets truncated', async () => {
    for (let i = 0; i <= ENTRY_CAP; i++) {
      await createTestEntry(db, workId, { name: `인물${i}` })
    }
    const big = await createTestEntry(db, workId, { name: '가나다' })
    for (let i = 0; i < FACT_CAP + 1; i++) {
      await createTestFact(db, workId, { content: `사실 ${i}`, entryId: big.id })
    }

    const context = await buildAuthorContext(db, actor, workId, dir, interviewPending('t1'))
    expect(context.wiki.entries).toHaveLength(ENTRY_CAP)
    const entry = context.wiki.entries.find((item) => item.name === '가나다')
    expect(entry?.facts.length).toBeLessThanOrEqual(FACT_CAP)
    expect(context.wiki.truncated).toBe(true)
  })

  it('is read-only for the wiki and the change log', async () => {
    await createTestEntry(db, workId, { name: '해연' })
    const before = [
      (await db.select().from(wikiEntries)).length,
      (await db.select().from(changeLog)).length,
    ]
    await buildAuthorContext(db, actor, workId, dir, interviewPending('t1'))
    const after = [
      (await db.select().from(wikiEntries)).length,
      (await db.select().from(changeLog)).length,
    ]
    expect(after).toEqual(before)
  })
})

describe('buildAuthorContext hints', () => {
  it('gives a duplicateOf hint to a card that matches a name or alias, not to a new one', async () => {
    await createTestEntry(db, workId, { name: '해연', aliases: ['연이'] })
    const pending = proposalsPending([
      { id: 'a', type: 'entry_create', payload: { name: '해 연' } },
      { id: 'b', type: 'entry_create', payload: { name: '연이' } },
      { id: 'c', type: 'entry_create', payload: { name: '새 인물' } },
    ])
    const { hints } = await buildAuthorContext(db, actor, workId, dir, pending)
    expect(hints.a?.duplicateOf).toBeDefined()
    expect(hints.b?.duplicateOf).toBeDefined()
    expect(hints.c).toBeUndefined()
  })

  it('gives a duplicateOf hint to a fact that repeats an existing one', async () => {
    const entry = await createTestEntry(db, workId, { name: '해연' })
    await createTestFact(db, workId, { content: '열쇠를 쥔다', entryId: entry.id })
    const pending = proposalsPending([
      { id: 'a', type: 'fact_create', payload: { subjectName: '해연', content: '열쇠를 쥔다.' } },
    ])
    const { hints } = await buildAuthorContext(db, actor, workId, dir, pending)
    expect(hints.a?.duplicateOf).toBeDefined()
  })

  it('hints only the later of two identical items in one batch', async () => {
    const pending = proposalsPending([
      { id: 'a', type: 'entry_create', payload: { name: '해연' } },
      { id: 'b', type: 'entry_create', payload: { name: '해연' } },
    ])
    const { hints } = await buildAuthorContext(db, actor, workId, dir, pending)
    expect(hints.b?.duplicateOf).toBeDefined()
    expect(hints.a).toBeUndefined()
  })

  it('gives previouslyRejected for a card rejected earlier, and duplicateOf for one approved earlier', async () => {
    logDecision(
      dir,
      proposalsPending([
        { id: 'r', type: 'entry_create', payload: { name: '세린' } },
        { id: 'k', type: 'entry_create', payload: { name: '해연' } },
      ]),
      {
        kind: 'proposals',
        decisions: [
          { id: 'r', approve: false, reason: 'cut name' },
          { id: 'k', approve: true, reason: 'ok' },
        ],
      },
    )
    const pending = proposalsPending([
      { id: 'a', type: 'entry_create', payload: { name: '세린' } },
      { id: 'b', type: 'entry_create', payload: { name: '해연' } },
    ])
    const { hints } = await buildAuthorContext(db, actor, workId, dir, pending)
    expect(hints.a?.previouslyRejected).toEqual({ step: 'ch1:proposals', reason: 'cut name' })
    expect(hints.b?.duplicateOf).toBeDefined()
  })

  it('matches a relation logged with spaces and punctuation', async () => {
    const logged = { sourceName: 'A B', targetName: 'B', kind: '동료' }
    logDecision(dir, proposalsPending([{ id: 'r', type: 'relation_create', payload: logged }]), {
      kind: 'proposals',
      decisions: [{ id: 'r', approve: false, reason: 'no' }],
    })
    const next = { sourceName: 'AB', targetName: 'B', kind: '동료' }
    const pending = proposalsPending([{ id: 'a', type: 'relation_create', payload: next }])
    const { hints } = await buildAuthorContext(db, actor, workId, dir, pending)
    expect(hints.a?.previouslyRejected).toEqual({ step: 'ch1:proposals', reason: 'no' })
  })

  it('gives duplicateOf for a relation approved earlier and logged with other spacing', async () => {
    logDecision(
      dir,
      proposalsPending([
        {
          id: 'r',
          type: 'relation_create',
          payload: { sourceName: 'A', targetName: 'B', kind: '동료' },
        },
      ]),
      { kind: 'proposals', decisions: [{ id: 'r', approve: true, reason: 'ok' }] },
    )
    const pending = proposalsPending([
      {
        id: 'a',
        type: 'relation_create',
        payload: { sourceName: 'A ', targetName: ' B', kind: '동료' },
      },
    ])
    const { hints } = await buildAuthorContext(db, actor, workId, dir, pending)
    expect(hints.a?.duplicateOf).toBeDefined()
  })

  it('gives endpointRejected for a relation to a card rejected earlier', async () => {
    logDecision(
      dir,
      proposalsPending([{ id: 'r', type: 'entry_create', payload: { name: '세린' } }]),
      {
        kind: 'proposals',
        decisions: [{ id: 'r', approve: false, reason: 'cut name' }],
      },
    )
    const pending = proposalsPending([
      {
        id: 'a',
        type: 'relation_create',
        payload: { sourceName: '백지원', targetName: '세린', kind: '동료' },
      },
    ])
    const { hints } = await buildAuthorContext(db, actor, workId, dir, pending)
    expect(hints.a?.endpointRejected).toEqual(['세린'])
  })

  it('gives endpointRejected when the logged label is spelled differently', async () => {
    logDecision(
      dir,
      proposalsPending([{ id: 'r', type: 'entry_create', payload: { name: '해 연' } }]),
      {
        kind: 'proposals',
        decisions: [{ id: 'r', approve: false, reason: 'cut name' }],
      },
    )
    const pending = proposalsPending([
      {
        id: 'a',
        type: 'relation_create',
        payload: { sourceName: '해연', targetName: '백지원', kind: '동료' },
      },
    ])
    const { hints } = await buildAuthorContext(db, actor, workId, dir, pending)
    expect(hints.a?.endpointRejected).toEqual(['해연'])
  })
})

describe('buildAuthorContext decisions', () => {
  it('summarizes rejections, approvals and interview answers', async () => {
    const batch = proposalsPending([
      { id: 'a', type: 'entry_create', payload: { name: '해연' } },
      { id: 'b', type: 'thread_create', payload: { title: '봉인' } },
      { id: 'c', type: 'thread_create', payload: { title: '종루' } },
    ])
    logDecision(dir, batch, {
      kind: 'proposals',
      decisions: [
        { id: 'a', approve: true, reason: 'ok' },
        { id: 'b', approve: false, reason: 'no' },
        { id: 'c', approve: true, reason: 'ok' },
      ],
    })
    const interview = interviewPending('t1')
    logDecision(dir, interview, {
      kind: 'interview_answer',
      answer: '세 겹이다.',
      bankKeys: ['k1'],
    })
    logDecision(
      dir,
      { ...interview, turnId: 't2' },
      { kind: 'interview_answer', answer: '모른다.', bankKeys: [] },
    )

    const context = await buildAuthorContext(db, actor, workId, dir, interviewPending('t3'))
    expect(context.decisions.rejected).toEqual([
      { step: 'ch1:proposals', type: 'thread_create', label: '봉인', reason: 'no' },
    ])
    expect(context.decisions.approvedCount).toBe(2)
    expect(context.decisions.recentApproved).toEqual(['해연', '종루'])
    expect(context.decisions.interviewAnswers).toEqual([
      {
        topic: '도시',
        question: '도시의 성벽은 몇 겹인가요?',
        answer: '세 겹이다.',
        bankKeys: ['k1'],
      },
      { topic: '도시', question: '도시의 성벽은 몇 겹인가요?', answer: '모른다.', bankKeys: [] },
    ])
  })

  it('skips malformed interview lines', async () => {
    const lines = [
      { at: 'x', step: 'interview', kind: 'interview_answer', answer: null },
      { at: 'x', step: 'interview', kind: 'interview_answer', answer: { answer: 3, bankKeys: [] } },
      {
        at: 'x',
        step: 'interview',
        kind: 'interview_answer',
        answer: { answer: 'a', bankKeys: 'k' },
      },
      {
        at: 'x',
        step: 'interview',
        kind: 'interview_answer',
        answer: { answer: 'ok', bankKeys: ['k'] },
      },
    ]
    writeFileSync(decisionsPath(), lines.map((line) => JSON.stringify(line)).join('\n'))
    const context = await buildAuthorContext(db, actor, workId, dir, interviewPending('t1'))
    expect(context.decisions.interviewAnswers).toEqual([
      { topic: '', question: '', answer: 'ok', bankKeys: ['k'] },
    ])
  })
})

describe('buildAuthorContext pendingRef', () => {
  it('tells waits apart by item ids and interview turn', async () => {
    const first = await buildAuthorContext(
      db,
      actor,
      workId,
      dir,
      proposalsPending([{ id: 'a', type: 'entry_create', payload: { name: '해연' } }]),
    )
    const second = await buildAuthorContext(
      db,
      actor,
      workId,
      dir,
      proposalsPending([{ id: 'c', type: 'entry_create', payload: { name: '세린' } }]),
    )
    expect(first.pendingRef.key).toBe(second.pendingRef.key)
    expect(first.pendingRef.itemIds).toEqual(['a'])
    expect(second.pendingRef.itemIds).toEqual(['c'])

    const t1 = await buildAuthorContext(db, actor, workId, dir, interviewPending('t1'))
    const t2 = await buildAuthorContext(db, actor, workId, dir, interviewPending('t2'))
    expect(t1.pendingRef.key).not.toBe(t2.pendingRef.key)
    expect(t1.pendingRef.key).toBe(pendingKey(interviewPending('t1')))
    expect(t1.pendingRef.itemIds).toEqual([])
  })
})

describe('countDecisionMetrics', () => {
  it('counts duplicate approvals and approvals after a reject', () => {
    const lines: DecisionLine[] = [
      {
        at: 'x',
        step: 'ch1:proposals',
        kind: 'proposals',
        answer: {},
        items: [
          { id: 'a', type: 'entry_create', label: '해연', approve: true, reason: 'ok' },
          { id: 'b', type: 'entry_create', label: '세린', approve: false, reason: 'cut' },
        ],
      },
      {
        at: 'x',
        step: 'ch2:proposals',
        kind: 'proposals',
        answer: {},
        items: [
          { id: 'a', type: 'entry_create', label: '해 연', approve: true, reason: 'ok' },
          { id: 'b', type: 'entry_create', label: '세린', approve: true, reason: 'ok' },
        ],
      },
      { at: 'x', step: 'interview', kind: 'interview_answer', answer: {} },
    ]
    expect(countDecisionMetrics(lines)).toEqual({ duplicateApprovals: 1, approvedAfterReject: 1 })
    expect(countDecisionMetrics([])).toEqual({ duplicateApprovals: 0, approvedAfterReject: 0 })
  })

  it('does not count empty labels as duplicates of each other', () => {
    const item = { id: 'a', type: 'relation_create', label: '', approve: true, reason: 'ok' }
    const lines: DecisionLine[] = [
      { at: 'x', step: 's', kind: 'proposals', answer: {}, items: [item, { ...item, id: 'b' }] },
    ]
    expect(countDecisionMetrics(lines)).toEqual({ duplicateApprovals: 0, approvedAfterReject: 0 })
  })
})

describe('author context file', () => {
  it('writes and removes author-context.json', () => {
    const context: AuthorContext = {
      pendingRef: { key: 'ch1:proposals|proposals|', itemIds: ['a'] },
      wiki: { entries: [], unattachedFacts: [], threads: [], relations: [], truncated: false },
      decisions: { rejected: [], approvedCount: 0, recentApproved: [], interviewAnswers: [] },
      hints: {},
    }
    writeAuthorContext(dir, context)
    const file = join(dir, 'author-context.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(context)

    removeAuthorContext(dir)
    expect(existsSync(file)).toBe(false)
    expect(() => removeAuthorContext(dir)).not.toThrow()
  })
})
