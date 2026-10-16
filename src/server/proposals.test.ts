import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import {
  changeLog,
  chapters,
  facts,
  proposals,
  relations,
  styleCards,
  threadEvents,
  threads,
  wikiEntries,
} from '@/db/schema'
import type { ProposalRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import type { NewProposal } from '@/lib/proposal-payloads'
import { insertProposals } from '@/server/proposal-store'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { approveProposal, bulkApprove, listProposals, rejectProposal } from './proposals'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function expectAppError(p: Promise<unknown>, code: string, message?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  if (message !== undefined) expect((err as AppError).message).toBe(message)
}

async function makeWork() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  const ch1 = await createTestChapter(db, work.id, { position: 1, title: '만남' })
  const ch2 = await createTestChapter(db, work.id, { position: 2, title: '재회' })
  return { owner, actor: { userId: owner.id }, work, ch1, ch2 }
}

async function propose(workId: string, item: NewProposal): Promise<ProposalRow> {
  const [row] = await insertProposals(db, workId, [item])
  return row
}

describe('approveProposal', () => {
  it('creates the entry from an entry_create proposal and records an ai change', async () => {
    const { owner, actor, work, ch1 } = await makeWork()
    const p = await propose(work.id, {
      type: 'entry_create',
      payload: {
        kind: 'character',
        name: '이서윤',
        aliases: ['서윤'],
        summary: '주인공',
        fields: { role: '주인공' },
      },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    expect(res.proposal.status).toBe('approved')
    expect(res.proposal.decidedBy).toBe(owner.id)
    expect(res.proposal.appliedTargetId).toBe(res.targetId)
    expect(res.targetId).toBeTruthy()
    const [entry] = await db.select().from(wikiEntries).where(eq(wikiEntries.id, res.targetId!))
    expect(entry.name).toBe('이서윤')
    expect(entry.createdByType).toBe('ai')
    const [change] = await db.select().from(changeLog).where(eq(changeLog.targetId, entry.id))
    expect(change.proposerType).toBe('ai')
    expect(change.proposalId).toBe(p.id)
    expect(change.actorId).toBe(owner.id)
  })

  it('merges into an existing entry with the same name instead of duplicating it', async () => {
    const { actor, work, ch1 } = await makeWork()
    const existing = await createTestEntry(db, work.id, { name: '이서윤', aliases: ['서윤'] })
    const p = await propose(work.id, {
      type: 'entry_create',
      payload: {
        kind: 'character',
        name: '이서윤',
        aliases: ['윤'],
        summary: '주인공',
        fields: { role: '주인공' },
      },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    expect(res.targetId).toBe(existing.id)
    const rows = await db.select().from(wikiEntries).where(eq(wikiEntries.workId, work.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].aliases).toEqual(expect.arrayContaining(['서윤', '윤']))
    expect(rows[0].summary).toBe('주인공')
    expect(rows[0].fields).toEqual({ role: '주인공' })
  })

  it('updates an entry from entry_update, merging fields and keeping existing aliases', async () => {
    const { actor, work, ch1 } = await makeWork()
    const entry = await createTestEntry(db, work.id, {
      name: '이서윤',
      aliases: ['서윤'],
      summary: '옛 요약',
    })
    const p = await propose(work.id, {
      type: 'entry_update',
      payload: {
        entryId: entry.id,
        entryName: '이서윤',
        patch: { summary: '새 요약', aliases: ['윤'], fields: { age: '17' } },
      },
      source: 'post_chapter',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    expect(res.targetId).toBe(entry.id)
    const [updated] = await db.select().from(wikiEntries).where(eq(wikiEntries.id, entry.id))
    expect(updated.summary).toBe('새 요약')
    expect(updated.aliases).toEqual(expect.arrayContaining(['서윤', '윤']))
    expect(updated.fields).toEqual({ age: '17' })
  })

  it('stores an assumed fact when approved with factStatus assumed and links the entry by subject', async () => {
    const { actor, work, ch1 } = await makeWork()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const p = await propose(work.id, {
      type: 'fact_create',
      payload: {
        subjectName: '이서윤',
        entryId: null,
        content: '검을 쓴다',
        suggestedStatus: 'confirmed',
        sourceChapterId: ch1.id,
        evidence: '검을 뽑았다',
        supersedesFactId: null,
      },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id, factStatus: 'assumed' })

    const [fact] = await db.select().from(facts).where(eq(facts.id, res.targetId!))
    expect(fact.status).toBe('assumed')
    expect(fact.entryId).toBe(entry.id)
    expect(fact.sourceType).toBe('import')
    expect(fact.createdByType).toBe('ai')
  })

  it('uses the suggested status when no factStatus is given', async () => {
    const { actor, work, ch1 } = await makeWork()
    const p = await propose(work.id, {
      type: 'fact_create',
      payload: {
        subjectName: '이서윤',
        entryId: null,
        content: '검을 쓴다',
        suggestedStatus: 'undecided',
        sourceChapterId: ch1.id,
        evidence: '',
        supersedesFactId: null,
      },
      source: 'post_chapter',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    const [fact] = await db.select().from(facts).where(eq(facts.id, res.targetId!))
    expect(fact.status).toBe('undecided')
    expect(fact.sourceType).toBe('chapter')
  })

  it('ends the old fact at the previous chapter when the proposal supersedes it', async () => {
    const { actor, work, ch1, ch2 } = await makeWork()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const old = await createTestFact(db, work.id, {
      content: '열여섯 살이다',
      entryId: entry.id,
      status: 'confirmed',
      sourceChapterId: ch1.id,
    })
    const p = await propose(work.id, {
      type: 'fact_create',
      payload: {
        subjectName: '이서윤',
        entryId: entry.id,
        content: '열일곱 살이다',
        suggestedStatus: 'confirmed',
        sourceChapterId: ch2.id,
        evidence: '열일곱이 되었다',
        supersedesFactId: old.id,
      },
      source: 'post_chapter',
      sourceRef: null,
      chapterId: ch2.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    const [ended] = await db.select().from(facts).where(eq(facts.id, old.id))
    expect(ended.validToPosition).toBe(1)
    expect(ended.supersededByFactId).toBe(res.targetId)
    const [created] = await db.select().from(facts).where(eq(facts.id, res.targetId!))
    expect(created.validFromPosition).toBe(2)
    expect(created.content).toBe('열일곱 살이다')
  })

  it('applies valid thread events and skips a resolve that happens before planting', async () => {
    const { actor, work, ch2 } = await makeWork()
    const p = await propose(work.id, {
      type: 'thread_create',
      payload: {
        title: '낡은 열쇠',
        description: '서윤의 방 서랍',
        status: 'planted',
        plantedChapterId: ch2.id,
        targetChapterPosition: null,
        importance: 'medium',
        relatedNames: [],
        evidence: '',
        events: [
          { kind: 'resolved', chapterId: ch2.id, evidence: '회수' },
          { kind: 'developed', chapterId: ch2.id, evidence: '발전' },
        ],
      },
      source: 'post_chapter',
      sourceRef: null,
      chapterId: ch2.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    const [thread] = await db.select().from(threads).where(eq(threads.id, res.targetId!))
    expect(thread.status).toBe('developing')
    const events = await db.select().from(threadEvents).where(eq(threadEvents.threadId, thread.id))
    expect(events.map((e) => e.kind).sort()).toEqual(['developed', 'planted'])
    expect(res.proposal.decisionNote).toContain('회수')
  })

  it('creates a thread from an interview proposal as planned, without a planted chapter', async () => {
    const { actor, work } = await makeWork()
    const p = await propose(work.id, {
      type: 'thread_create',
      payload: {
        title: '가문의 비밀',
        description: '',
        status: 'planted',
        plantedChapterId: null,
        targetChapterPosition: null,
        importance: 'high',
        relatedNames: [],
        evidence: '',
        events: [],
      },
      source: 'interview',
      sourceRef: 'turn-1',
      chapterId: null,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    const [thread] = await db.select().from(threads).where(eq(threads.id, res.targetId!))
    expect(thread.status).toBe('planned')
    expect(thread.plantedChapterId).toBeNull()
  })

  it('applies thread_event to an existing thread', async () => {
    const { actor, work, ch1, ch2 } = await makeWork()
    const thread = await createTestThread(db, work.id, {
      title: '낡은 열쇠',
      status: 'planted',
      plantedChapterId: ch1.id,
    })
    const p = await propose(work.id, {
      type: 'thread_event',
      payload: {
        threadId: thread.id,
        threadTitle: '낡은 열쇠',
        kind: 'developed',
        chapterId: ch2.id,
        note: '',
        evidence: '열쇠가 다시 나온다',
      },
      source: 'post_chapter',
      sourceRef: null,
      chapterId: ch2.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    expect(res.targetId).toBeTruthy()
    const [updated] = await db.select().from(threads).where(eq(threads.id, thread.id))
    expect(updated.status).toBe('developing')
  })

  it('rejects a relation when one of its cards is missing, naming the card', async () => {
    const { actor, work } = await makeWork()
    await createTestEntry(db, work.id, { name: '이서윤' })
    const p = await propose(work.id, {
      type: 'relation_create',
      payload: {
        sourceName: '이서윤',
        targetName: '없는사람',
        kind: '가족',
        description: '',
        directed: false,
        startPosition: null,
        evidence: '',
      },
      source: 'import',
      sourceRef: null,
      chapterId: null,
    })

    await expectAppError(
      approveProposal(db, actor, { proposalId: p.id }),
      'BAD_STATE',
      '관계에 필요한 카드(없는사람)가 위키에 없습니다. 카드 제안을 먼저 승인하세요.',
    )
    const [still] = await db.select().from(proposals).where(eq(proposals.id, p.id))
    expect(still.status).toBe('pending')
    const rels = await db.select().from(relations).where(eq(relations.workId, work.id))
    expect(rels).toHaveLength(0)
  })

  it('creates a relation with the proposal chapter as its start when none is given', async () => {
    const { actor, work, ch2 } = await makeWork()
    await createTestEntry(db, work.id, { name: '이서윤' })
    await createTestEntry(db, work.id, { name: '민준' })
    const p = await propose(work.id, {
      type: 'relation_create',
      payload: {
        sourceName: '이서윤',
        targetName: '민준',
        kind: '연인',
        description: '',
        directed: false,
        startPosition: null,
        evidence: '',
      },
      source: 'post_chapter',
      sourceRef: null,
      chapterId: ch2.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    const [rel] = await db.select().from(relations).where(eq(relations.id, res.targetId!))
    expect(rel.startPosition).toBe(2)
    expect(rel.kind).toBe('연인')
  })

  it('sets the chapter summary for chapter_summary and records an ai change', async () => {
    const { actor, work, ch1 } = await makeWork()
    const p = await propose(work.id, {
      type: 'chapter_summary',
      payload: { chapterId: ch1.id, summary: '두 사람이 처음 만난다.' },
      source: 'post_chapter',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    expect(res.targetId).toBe(ch1.id)
    const [chapter] = await db.select().from(chapters).where(eq(chapters.id, ch1.id))
    expect(chapter.summary).toBe('두 사람이 처음 만난다.')
    const [change] = await db.select().from(changeLog).where(eq(changeLog.targetId, ch1.id))
    expect(change.proposerType).toBe('ai')
  })

  it('creates a style card and links it to a named entry when the entry exists', async () => {
    const { actor, work } = await makeWork()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const p = await propose(work.id, {
      type: 'style_card',
      payload: {
        entryName: '이서윤',
        name: '서윤의 말투',
        tone: '짧고 건조하다',
        rules: '존댓말 없음',
        examples: '"괜찮아."',
      },
      source: 'style',
      sourceRef: null,
      chapterId: null,
    })

    const res = await approveProposal(db, actor, { proposalId: p.id })

    const [card] = await db.select().from(styleCards).where(eq(styleCards.id, res.targetId!))
    expect(card.entryId).toBe(entry.id)
    expect(card.name).toBe('서윤의 말투')
  })

  it('re-validates an edited payload and rejects an invalid override without changing the proposal', async () => {
    const { actor, work, ch1 } = await makeWork()
    const p = await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    await expectAppError(
      approveProposal(db, actor, { proposalId: p.id, payloadOverride: { kind: 'nonsense' } }),
      'VALIDATION',
    )
    const [still] = await db.select().from(proposals).where(eq(proposals.id, p.id))
    expect(still.status).toBe('pending')
  })

  it('applies an edited name from payloadOverride', async () => {
    const { actor, work, ch1 } = await makeWork()
    const p = await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const res = await approveProposal(db, actor, {
      proposalId: p.id,
      payloadOverride: { name: '신도윤' },
    })

    const [entry] = await db.select().from(wikiEntries).where(eq(wikiEntries.id, res.targetId!))
    expect(entry.name).toBe('신도윤')
  })

  it('refuses a second approval of the same proposal with BAD_STATE', async () => {
    const { actor, work, ch1 } = await makeWork()
    const p = await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })
    await approveProposal(db, actor, { proposalId: p.id })

    await expectAppError(
      approveProposal(db, actor, { proposalId: p.id }),
      'BAD_STATE',
      '이미 처리된 제안입니다.',
    )
  })

  it('refuses a viewer with FORBIDDEN and a stranger with NOT_FOUND', async () => {
    const { owner, work, ch1 } = await makeWork()
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    const stranger = await createTestUser(db)
    const p = await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    await expectAppError(
      approveProposal(db, { userId: viewer.id }, { proposalId: p.id }),
      'FORBIDDEN',
    )
    await expectAppError(
      approveProposal(db, { userId: stranger.id }, { proposalId: p.id }),
      'NOT_FOUND',
    )
    await expectAppError(
      approveProposal(
        db,
        { userId: owner.id },
        { proposalId: '00000000-0000-4000-8000-000000000000' },
      ),
      'NOT_FOUND',
    )
  })

  it('refuses a supersede that points at a fact of another work', async () => {
    const { actor, work, ch2 } = await makeWork()
    const other = await createTestWork(db, actor.userId, { title: '다른 작품' })
    const foreign = await createTestFact(db, other.id, { content: '다른 작품의 사실' })
    const p = await propose(work.id, {
      type: 'fact_create',
      payload: {
        subjectName: '이서윤',
        entryId: null,
        content: '바뀐 사실',
        suggestedStatus: 'confirmed',
        sourceChapterId: ch2.id,
        evidence: '',
        supersedesFactId: foreign.id,
      },
      source: 'post_chapter',
      sourceRef: null,
      chapterId: ch2.id,
    })

    await expectAppError(approveProposal(db, actor, { proposalId: p.id }), 'NOT_FOUND')
    const [still] = await db.select().from(proposals).where(eq(proposals.id, p.id))
    expect(still.status).toBe('pending')
    const [untouched] = await db.select().from(facts).where(eq(facts.id, foreign.id))
    expect(untouched.supersededByFactId).toBeNull()
  })
})

describe('rejectProposal', () => {
  it('marks the proposal rejected and leaves the wiki unchanged', async () => {
    const { actor, work, ch1 } = await makeWork()
    const p = await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const row = await rejectProposal(db, actor, { proposalId: p.id, note: '잘못된 인물' })

    expect(row.status).toBe('rejected')
    expect(row.decisionNote).toBe('잘못된 인물')
    const entries = await db.select().from(wikiEntries).where(eq(wikiEntries.workId, work.id))
    expect(entries).toHaveLength(0)
    const changes = await db.select().from(changeLog).where(eq(changeLog.workId, work.id))
    expect(changes).toHaveLength(0)
  })
})

describe('bulkApprove', () => {
  it('applies in dependency order even when inserted in reverse, and keeps going after a failure', async () => {
    const { actor, work, ch1 } = await makeWork()
    // Inserted in the reverse of the dependency order: fact, relation (fails), entry.
    const fact = await propose(work.id, {
      type: 'fact_create',
      payload: {
        subjectName: '이서윤',
        entryId: null,
        content: '검을 쓴다',
        suggestedStatus: 'confirmed',
        sourceChapterId: ch1.id,
        evidence: '',
        supersedesFactId: null,
      },
      source: 'import',
      sourceRef: 'job-1',
      chapterId: ch1.id,
    })
    const relation = await propose(work.id, {
      type: 'relation_create',
      payload: {
        sourceName: '이서윤',
        targetName: '없는사람',
        kind: '가족',
        description: '',
        directed: false,
        startPosition: null,
        evidence: '',
      },
      source: 'import',
      sourceRef: 'job-1',
      chapterId: ch1.id,
    })
    const entry = await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: 'job-1',
      chapterId: ch1.id,
    })

    const result = await bulkApprove(db, actor, { workId: work.id, sourceRef: 'job-1' })

    expect(result.approved).toBe(2)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].proposalId).toBe(relation.id)
    const [savedEntry] = await db.select().from(wikiEntries).where(eq(wikiEntries.workId, work.id))
    const [savedFact] = await db.select().from(facts).where(eq(facts.workId, work.id))
    expect(savedFact.entryId).toBe(savedEntry.id)
    const [rel] = await db.select().from(proposals).where(eq(proposals.id, relation.id))
    expect(rel.status).toBe('pending')
    const [done] = await db.select().from(proposals).where(eq(proposals.id, entry.id))
    expect(done.status).toBe('approved')
    expect(done.appliedTargetId).toBe(savedEntry.id)
    const [doneFact] = await db.select().from(proposals).where(eq(proposals.id, fact.id))
    expect(doneFact.status).toBe('approved')
  })

  it('uses the suggested fact status by default and undecided when useSuggestedStatus is false', async () => {
    const { actor, work, ch1 } = await makeWork()
    const a = await propose(work.id, {
      type: 'fact_create',
      payload: {
        subjectName: '이서윤',
        entryId: null,
        content: '가정 사실',
        suggestedStatus: 'assumed',
        sourceChapterId: ch1.id,
        evidence: '',
        supersedesFactId: null,
      },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })
    const b = await propose(work.id, {
      type: 'fact_create',
      payload: {
        subjectName: '이서윤',
        entryId: null,
        content: '다른 사실',
        suggestedStatus: 'assumed',
        sourceChapterId: ch1.id,
        evidence: '',
        supersedesFactId: null,
      },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const first = await bulkApprove(db, actor, { workId: work.id, proposalIds: [a.id] })
    const second = await bulkApprove(db, actor, {
      workId: work.id,
      proposalIds: [b.id],
      useSuggestedStatus: false,
    })

    expect(first.approved).toBe(1)
    expect(second.approved).toBe(1)
    const rows = await db.select().from(facts).where(eq(facts.workId, work.id))
    const byContent = Object.fromEntries(rows.map((r) => [r.content, r.status]))
    expect(byContent['가정 사실']).toBe('assumed')
    expect(byContent['다른 사실']).toBe('undecided')
  })

  it('reports a missing id as failed and does not approve other works proposals', async () => {
    const { actor, work, ch1 } = await makeWork()
    const other = await createTestWork(db, actor.userId, { title: '다른 작품' })
    const foreign = await propose(other.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '외부인', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: null,
    })
    const mine = await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const result = await bulkApprove(db, actor, {
      workId: work.id,
      proposalIds: [mine.id, foreign.id],
    })

    expect(result.approved).toBe(1)
    expect(result.failed).toEqual([{ proposalId: foreign.id, message: '항목을 찾을 수 없습니다.' }])
  })

  it('refuses to run without ids or a sourceRef', async () => {
    const { actor, work } = await makeWork()
    await expectAppError(bulkApprove(db, actor, { workId: work.id }), 'VALIDATION')
  })
})

describe('listProposals', () => {
  it('lists pending proposals in apply order with group labels', async () => {
    const { actor, work, ch1 } = await makeWork()
    await propose(work.id, {
      type: 'fact_create',
      payload: {
        subjectName: '이서윤',
        entryId: null,
        content: '검을 쓴다',
        suggestedStatus: 'confirmed',
        sourceChapterId: ch1.id,
        evidence: '',
        supersedesFactId: null,
      },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })
    await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })

    const list = await listProposals(db, actor, work.id)

    expect(list.map((p) => p.type)).toEqual(['entry_create', 'fact_create'])
    expect(list[0].groupKey).toBe(list[1].groupKey)
    expect(list[0].groupLabel).toBe('이서윤')
    expect(list[0].chapterPosition).toBe(1)
    expect(list[0].chapterTitle).toBe('만남')
  })

  it('filters by chapter and status', async () => {
    const { actor, work, ch1, ch2 } = await makeWork()
    const a = await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '가', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: ch1.id,
    })
    await propose(work.id, {
      type: 'entry_create',
      payload: { kind: 'character', name: '나', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: ch2.id,
    })
    await rejectProposal(db, actor, { proposalId: a.id })

    const onlyCh2 = await listProposals(db, actor, work.id, { chapterId: ch2.id })
    expect(onlyCh2).toHaveLength(1)
    const rejected = await listProposals(db, actor, work.id, { status: 'rejected' })
    expect(rejected.map((p) => p.id)).toEqual([a.id])
  })

  it('refuses non-members with NOT_FOUND', async () => {
    const { work } = await makeWork()
    const stranger = await createTestUser(db)
    await expectAppError(listProposals(db, { userId: stranger.id }, work.id), 'NOT_FOUND')
  })
})
