import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog, relations, wikiEntries } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { recomputeAppearances } from './appearances'
import {
  archiveRelation,
  createRelation,
  getGraphData,
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
      '같은 카드끼리는 연결할 수 없습니다.',
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
      '시작 회차가 끝 회차보다 늦습니다.',
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
      '시작 회차가 끝 회차보다 늦습니다.',
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
