import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog, chapters, proposals, relations, wikiEntries } from '@/db/schema'
import { AppError } from '@/lib/errors'
import type { NewProposal } from '@/lib/proposal-payloads'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { recomputeAppearances } from './appearances'
import { insertProposals } from './proposal-store'
import { approveProposal } from './proposals'
import {
  archiveRelation,
  createRelation,
  getGraphData,
  getGraphViewData,
  listRelations,
  updateRelation,
} from './relations'

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
  return { work, actor: { userId: owner.id } }
}

describe('createRelation', () => {
  it('rejects a relation from a card to itself', async () => {
    const { work, actor } = await makeWork()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    await expectAppError(
      createRelation(db, actor, {
        workId: work.id,
        sourceEntryId: entry.id,
        targetEntryId: entry.id,
        kind: '동료',
      }),
      'VALIDATION',
      '같은 카드끼리는 연결할 수 없어요.',
    )
  })

  it('rejects a start chapter later than the end chapter', async () => {
    const { work, actor } = await makeWork()
    const a = await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    await expectAppError(
      createRelation(db, actor, {
        workId: work.id,
        sourceEntryId: a.id,
        targetEntryId: b.id,
        kind: '연인',
        startPosition: 5,
        endPosition: 2,
      }),
      'VALIDATION',
      '시작 회차가 끝 회차보다 늦어요.',
    )
  })

  it('rejects an entry from another work with NOT_FOUND', async () => {
    const { work, actor } = await makeWork()
    const mine = await createTestEntry(db, work.id, { name: '이서윤' })
    const otherOwner = await createTestUser(db)
    const otherWork = await createTestWork(db, otherOwner.id)
    const foreign = await createTestEntry(db, otherWork.id, { name: '남의 인물' })
    await expectAppError(
      createRelation(db, actor, {
        workId: work.id,
        sourceEntryId: mine.id,
        targetEntryId: foreign.id,
        kind: '적대',
      }),
      'NOT_FOUND',
    )
  })

  it('rejects a viewer with FORBIDDEN', async () => {
    const { work } = await makeWork()
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    const a = await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    await expectAppError(
      createRelation(
        db,
        { userId: viewer.id },
        {
          workId: work.id,
          sourceEntryId: a.id,
          targetEntryId: b.id,
          kind: '적대',
        },
      ),
      'FORBIDDEN',
    )
  })

  it('creates the relation, records a change, and lists it with entry names', async () => {
    const { work, actor } = await makeWork()
    const a = await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    const row = await createRelation(db, actor, {
      workId: work.id,
      sourceEntryId: a.id,
      targetEntryId: b.id,
      kind: '연인',
      directed: false,
      startPosition: 2,
    })
    expect(row.kind).toBe('연인')
    expect(row.startPosition).toBe(2)
    expect(row.endPosition).toBeNull()

    const changes = await db
      .select()
      .from(changeLog)
      .where(and(eq(changeLog.workId, work.id), eq(changeLog.targetTable, 'relations')))
    expect(changes).toHaveLength(1)
    expect(changes[0].action).toBe('create')

    const views = await listRelations(db, actor, work.id)
    expect(views).toHaveLength(1)
    expect(views[0]).toMatchObject({ sourceName: '이서윤', targetName: '박도윤' })
  })
})

describe('updateRelation, archiveRelation and listRelations', () => {
  it('re-validates the merged dates on update', async () => {
    const { work, actor } = await makeWork()
    const a = await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    const row = await createRelation(db, actor, {
      workId: work.id,
      sourceEntryId: a.id,
      targetEntryId: b.id,
      kind: '동료',
      startPosition: 1,
      endPosition: 4,
    })
    await expectAppError(
      updateRelation(db, actor, row.id, { startPosition: 6 }),
      'VALIDATION',
      '시작 회차가 끝 회차보다 늦어요.',
    )
    const updated = await updateRelation(db, actor, row.id, { kind: '스승', endPosition: null })
    expect(updated.kind).toBe('스승')
    expect(updated.endPosition).toBeNull()
  })

  it('hides archived relations from the list', async () => {
    const { work, actor } = await makeWork()
    const a = await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    const row = await createRelation(db, actor, {
      workId: work.id,
      sourceEntryId: a.id,
      targetEntryId: b.id,
      kind: '가족',
    })
    await archiveRelation(db, actor, row.id)
    expect(await listRelations(db, actor, work.id)).toHaveLength(0)
    expect(await listRelations(db, actor, work.id, { includeArchived: true })).toHaveLength(1)
    const [stored] = await db.select().from(relations).where(eq(relations.id, row.id))
    expect(stored.archivedAt).not.toBeNull()
  })
})

describe('getGraphData', () => {
  it('returns nodes with first appearance, only active edges, and the latest chapter', async () => {
    const { work, actor } = await makeWork()
    const ch1 = await createTestChapter(db, work.id, {
      position: 1,
      body: '이서윤이 걸었다.',
    })
    const ch2 = await createTestChapter(db, work.id, {
      position: 2,
      body: '박도윤이 기다렸다. 이서윤이 다시 왔다.',
    })
    await createTestChapter(db, work.id, { position: 7, body: '' })
    await recomputeAppearances(db, ch1.id)
    await recomputeAppearances(db, ch2.id)

    const a = await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    const c = await createTestEntry(db, work.id, { name: '보관된 인물' })
    // Appearances are derived from chapter text, so recompute once the cards exist.
    await recomputeAppearances(db, ch1.id)
    await recomputeAppearances(db, ch2.id)
    const kept = await createRelation(db, actor, {
      workId: work.id,
      sourceEntryId: a.id,
      targetEntryId: b.id,
      kind: '연인',
      startPosition: 2,
    })
    const toArchived = await createRelation(db, actor, {
      workId: work.id,
      sourceEntryId: a.id,
      targetEntryId: c.id,
      kind: '적대',
    })
    await archiveRelation(db, actor, toArchived.id)

    const graph = await getGraphData(db, actor, work.id)
    expect(graph.latestPosition).toBe(7)

    const nodeA = graph.nodes.find((n) => n.id === a.id)
    const nodeB = graph.nodes.find((n) => n.id === b.id)
    expect(nodeA?.firstAppearance).toBe(1)
    expect(nodeB?.firstAppearance).toBe(2)
    expect(graph.nodes.find((n) => n.id === c.id)?.firstAppearance).toBeNull()

    expect(graph.edges.map((e) => e.id)).toEqual([kept.id])
    expect(graph.edges[0]).toMatchObject({
      source: a.id,
      target: b.id,
      kind: '연인',
      startPosition: 2,
      endPosition: null,
    })
  })

  it('leaves out archived cards and the edges that touch them', async () => {
    const { work, actor } = await makeWork()
    const a = await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    await createRelation(db, actor, {
      workId: work.id,
      sourceEntryId: a.id,
      targetEntryId: b.id,
      kind: '동료',
    })
    await db.update(wikiEntries).set({ archivedAt: new Date() }).where(eq(wikiEntries.id, b.id))

    const graph = await getGraphData(db, actor, work.id)
    expect(graph.nodes.map((n) => n.id)).toEqual([a.id])
    expect(graph.edges).toHaveLength(0)
  })
})

describe('getGraphViewData', () => {
  function relationProposal(chapterId: string | null, kind = '동료'): NewProposal {
    return {
      type: 'relation_create',
      source: chapterId ? 'post_chapter' : 'interview',
      sourceRef: null,
      chapterId,
      payload: {
        sourceName: '이서윤',
        targetName: '박도윤',
        kind,
        directed: true,
        description: '',
        startPosition: 2,
        evidence: '둘은 같은 반에서 일했다.',
      },
    }
  }

  it('shows canonical summaries and a recorded chapter to a work viewer after approval', async () => {
    const { work, actor } = await makeWork()
    const a = await createTestEntry(db, work.id, { name: '이서윤', summary: '탐사대 대장' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    const chapter = await createTestChapter(db, work.id, { position: 7, title: '새로운 동료' })
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    const [proposal] = await insertProposals(db, work.id, [relationProposal(chapter.id)])

    const context = { userId: viewer.id }
    expect((await getGraphViewData(db, context, work.id)).edges).toEqual([])
    const { targetId } = await approveProposal(db, actor, { proposalId: proposal.id })
    const graph = await getGraphViewData(db, context, work.id)

    expect(graph.nodes.find((node) => node.id === a.id)?.summary).toBe('탐사대 대장')
    expect(graph.edges).toEqual([
      {
        id: targetId,
        source: a.id,
        target: b.id,
        kind: '동료',
        description: '',
        directed: true,
        startPosition: 2,
        endPosition: null,
        evidenceChapter: { position: 7, title: '새로운 동료' },
      },
    ])
    expect((await getGraphData(db, context, work.id)).nodes[0]).not.toHaveProperty('summary')
    const stranger = await createTestUser(db)
    await expectAppError(getGraphViewData(db, { userId: stranger.id }, work.id), 'NOT_FOUND')
  })

  it('leaves evidence empty for a manual relation and a chapterless approval', async () => {
    const { work, actor } = await makeWork()
    const a = await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    const chapter = await createTestChapter(db, work.id, { position: 7, title: '새로운 동료' })
    const manual = await createRelation(db, actor, {
      workId: work.id,
      sourceEntryId: a.id,
      targetEntryId: b.id,
      kind: '동료',
      directed: true,
      startPosition: 2,
    })
    const [duplicate, chapterless] = await insertProposals(db, work.id, [
      relationProposal(chapter.id),
      relationProposal(null, '가족'),
    ])
    const duplicateApproval = await approveProposal(db, actor, { proposalId: duplicate.id })
    const chapterlessApproval = await approveProposal(db, actor, { proposalId: chapterless.id })
    expect(duplicateApproval.targetId).toBe(manual.id)

    const graph = await getGraphViewData(db, actor, work.id)
    expect(graph.edges).toHaveLength(2)
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: manual.id, evidenceChapter: null }),
        expect.objectContaining({ id: chapterlessApproval.targetId, evidenceChapter: null }),
      ]),
    )
  })

  it('does not attach the creation source to a changed relationship identity', async () => {
    const { work, actor } = await makeWork()
    await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    const c = await createTestEntry(db, work.id, { name: '최유리' })
    const chapter = await createTestChapter(db, work.id, { position: 7, title: '새로운 동료' })
    const [proposal] = await insertProposals(db, work.id, [relationProposal(chapter.id)])
    const { targetId } = await approveProposal(db, actor, { proposalId: proposal.id })
    if (!targetId) throw new Error('The test proposal did not create a relation.')

    const readEvidence = async () =>
      (await getGraphViewData(db, actor, work.id)).edges[0].evidenceChapter
    await updateRelation(db, actor, targetId, { endPosition: 8 })
    expect(await readEvidence()).toEqual({ position: 7, title: '새로운 동료' })

    for (const patch of [{ targetEntryId: c.id }, { kind: '적대' }, { directed: false }]) {
      await updateRelation(db, actor, targetId, patch)
      expect(await readEvidence()).toBeNull()
      await updateRelation(db, actor, targetId, {
        targetEntryId: b.id,
        kind: '동료',
        directed: true,
      })
    }
  })

  it('ignores unapproved proposals and unavailable or out-of-work source chapters', async () => {
    const { work, actor } = await makeWork()
    await createTestEntry(db, work.id, { name: '이서윤' })
    await createTestEntry(db, work.id, { name: '박도윤' })
    const chapter = await createTestChapter(db, work.id, { position: 7, title: '새로운 동료' })
    const other = await makeWork()
    const otherChapter = await createTestChapter(db, other.work.id, { title: '다른 작품 회차' })
    const [proposal] = await insertProposals(db, work.id, [relationProposal(chapter.id)])
    await approveProposal(db, actor, { proposalId: proposal.id })

    const readEvidence = async () =>
      (await getGraphViewData(db, actor, work.id)).edges[0].evidenceChapter
    await db.update(proposals).set({ status: 'rejected' }).where(eq(proposals.id, proposal.id))
    expect(await readEvidence()).toBeNull()

    await db.update(proposals).set({ status: 'approved' }).where(eq(proposals.id, proposal.id))
    await db.update(chapters).set({ archivedAt: new Date() }).where(eq(chapters.id, chapter.id))
    expect(await readEvidence()).toBeNull()

    await db
      .update(proposals)
      .set({ chapterId: otherChapter.id })
      .where(eq(proposals.id, proposal.id))
    expect(await readEvidence()).toBeNull()

    await db.update(chapters).set({ archivedAt: null }).where(eq(chapters.id, chapter.id))
    await db
      .update(proposals)
      .set({ chapterId: chapter.id, workId: other.work.id })
      .where(eq(proposals.id, proposal.id))
    expect(await readEvidence()).toBeNull()
  })
})
