import { randomUUID } from 'node:crypto'
import { eq, type SQL, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog, chapters, facts, threadEntries, threads, wikiEntries } from '@/db/schema'
import type { Actor } from '@/db/types'
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
import { AppError } from '@/lib/errors'
import { getEntryAppearances } from './appearances'
import { listChanges, recordChange, revertChange } from './changes'
import { archiveFact, factsValidAt, listFacts, supersedeFact } from './facts'
import { addThreadEvent, createThread, updateThread } from './threads'
import { archiveEntry, createEntry, updateEntry } from './wiki'

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
  if (message) expect((err as AppError).message).toBe(message)
}

async function currentEntry(entryId: string) {
  const [row] = await db.select().from(wikiEntries).where(eq(wikiEntries.id, entryId))
  return row
}

describe('recordChange and listChanges', () => {
  it('stores before/after as null when they are absent', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const change = await recordChange(db, {
      workId: work.id,
      targetTable: 'wiki_entries',
      targetId: entry.id,
      action: 'create',
      before: null,
      after: entry,
      proposerType: 'author',
      actorId: owner.id,
      summary: "인물 '이서윤' 생성",
    })
    expect(change.before).toBeNull()
    expect(change.after).toMatchObject({ name: '이서윤' })
    expect(change.proposalId).toBeNull()
    expect(change.revertsChangeId).toBeNull()
  })

  it('filters by proposerType and returns the actor name, newest first', async () => {
    const owner = await createTestUser(db, { name: '작가 김' })
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const base = {
      workId: work.id,
      targetTable: 'wiki_entries' as const,
      targetId: entry.id,
      before: null,
      after: null,
      actorId: owner.id,
    }
    await recordChange(db, {
      ...base,
      action: 'create',
      proposerType: 'ai',
      summary: 'AI 제안 생성',
    })
    await recordChange(db, {
      ...base,
      action: 'update',
      proposerType: 'author',
      summary: '작가 수정',
    })
    // Two calls can read the same clock value, and then the order falls to the random ids.
    // Pin the AI row to an earlier time so the newest-first order is fixed.
    await db
      .update(changeLog)
      .set({ createdAt: sql`timestamptz '2026-10-16 05:00:00+00'` })
      .where(eq(changeLog.summary, 'AI 제안 생성'))

    const aiOnly = await listChanges(db, { userId: owner.id }, work.id, { proposerType: 'ai' })
    expect(aiOnly.map((c) => c.summary)).toEqual(['AI 제안 생성'])
    expect(aiOnly[0].actorName).toBe('작가 김')

    const all = await listChanges(db, { userId: owner.id }, work.id)
    expect(all.map((c) => c.summary)).toEqual(['작가 수정', 'AI 제안 생성'])
  })

  it('lets a viewer read the history but not a stranger', async () => {
    const owner = await createTestUser(db)
    const viewer = await createTestUser(db)
    const stranger = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expect(listChanges(db, { userId: viewer.id }, work.id)).resolves.toEqual([])
    await expectAppError(listChanges(db, { userId: stranger.id }, work.id), 'NOT_FOUND')
  })
})

describe('listChanges paging and revertable flag', () => {
  // Inserts change rows with explicit ids and timestamps (the SQL expression decides the precision).
  async function insertChanges(
    workId: string,
    targetId: string,
    actorId: string,
    createdAt: (i: number) => SQL,
    count: number,
  ): Promise<string[]> {
    const ids = Array.from({ length: count }, () => randomUUID())
    await db.insert(changeLog).values(
      ids.map((id, i) => ({
        id,
        workId,
        targetTable: 'wiki_entries' as const,
        targetId,
        action: 'update' as const,
        before: null,
        after: null,
        proposerType: 'author' as const,
        actorId,
        summary: `변경 ${i}`,
        createdAt: createdAt(i),
      })),
    )
    return ids
  }

  it('pages through rows that share a millisecond without skipping any', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    // 150 microseconds apart: about seven rows share each millisecond.
    const ids = await insertChanges(
      work.id,
      entry.id,
      owner.id,
      (i) =>
        sql`(timestamptz '2026-10-16 05:00:00.123000+00' + ${i * 150}::int * interval '1 microsecond')`,
      130,
    )

    const seen: string[] = []
    let beforeId: string | undefined
    for (let page = 0; page < 5; page++) {
      const rows = await listChanges(db, { userId: owner.id }, work.id, { limit: 50, beforeId })
      seen.push(...rows.map((r) => r.id))
      if (rows.length < 50) break
      beforeId = rows[rows.length - 1].id
    }
    // Newest first: the last inserted row has the latest timestamp.
    expect(seen).toEqual([...ids].reverse())
  })

  it('breaks identical timestamps by id so paging stays stable', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const ids = await insertChanges(
      work.id,
      entry.id,
      owner.id,
      () => sql`timestamptz '2026-10-16 05:00:00.5+00'`,
      60,
    )

    const first = await listChanges(db, { userId: owner.id }, work.id, { limit: 50 })
    const second = await listChanges(db, { userId: owner.id }, work.id, {
      limit: 50,
      beforeId: first[first.length - 1].id,
    })
    const seen = [...first, ...second].map((r) => r.id)
    expect(seen).toEqual([...ids].sort().reverse())
  })

  it('returns nothing for a cursor that belongs to another work', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const otherWork = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const otherEntry = await createTestEntry(db, otherWork.id, { name: '다른 인물' })
    await insertChanges(work.id, entry.id, owner.id, () => sql`now()`, 2)
    const [foreignId] = await insertChanges(
      otherWork.id,
      otherEntry.id,
      owner.id,
      () => sql`now()`,
      1,
    )

    const rows = await listChanges(db, { userId: owner.id }, work.id, { beforeId: foreignId })
    expect(rows).toEqual([])
  })

  it('marks only the newest change of each target as revertable', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const otherEntry = await createTestEntry(db, work.id, { name: '박도윤' })
    const [oldest, middle, newest] = await insertChanges(
      work.id,
      entry.id,
      owner.id,
      (i) => sql`(timestamptz '2026-10-16 05:00:00+00' + ${i}::int * interval '1 second')`,
      3,
    )
    const [only] = await insertChanges(work.id, otherEntry.id, owner.id, () => sql`now()`, 1)

    const rows = await listChanges(db, { userId: owner.id }, work.id)
    const revertable = (id: string) => rows.find((r) => r.id === id)?.revertable
    expect(revertable(oldest)).toBe(false)
    expect(revertable(middle)).toBe(false)
    expect(revertable(newest)).toBe(true)
    expect(revertable(only)).toBe(true)
  })
})

describe('revertChange', () => {
  it('revert of create archives the row and records a revert change', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const created = await recordChange(db, {
      workId: work.id,
      targetTable: 'wiki_entries',
      targetId: entry.id,
      action: 'create',
      before: null,
      after: entry,
      proposerType: 'author',
      actorId: owner.id,
      summary: "인물 '이서윤' 생성",
    })

    const reverted = await revertChange(db, { userId: owner.id }, created.id)

    expect((await currentEntry(entry.id)).archivedAt).not.toBeNull()
    expect(reverted.action).toBe('revert')
    expect(reverted.revertsChangeId).toBe(created.id)
    expect(reverted.summary).toBe("되돌리기: 인물 '이서윤' 생성")
    expect(reverted.actorId).toBe(owner.id)
  })

  it('revert of update restores the before values', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '서윤' })
    const before = await currentEntry(entry.id)
    await db.update(wikiEntries).set({ name: '이서윤' }).where(eq(wikiEntries.id, entry.id))
    const after = await currentEntry(entry.id)
    const updated = await recordChange(db, {
      workId: work.id,
      targetTable: 'wiki_entries',
      targetId: entry.id,
      action: 'update',
      before,
      after,
      proposerType: 'author',
      actorId: owner.id,
      summary: "인물 '서윤' 이름 변경",
    })

    await revertChange(db, { userId: owner.id }, updated.id)

    expect((await currentEntry(entry.id)).name).toBe('서윤')
  })

  it('revert of archive unarchives the row', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const before = await currentEntry(entry.id)
    await db.update(wikiEntries).set({ archivedAt: new Date() }).where(eq(wikiEntries.id, entry.id))
    const archive = await recordChange(db, {
      workId: work.id,
      targetTable: 'wiki_entries',
      targetId: entry.id,
      action: 'archive',
      before,
      after: await currentEntry(entry.id),
      proposerType: 'author',
      actorId: owner.id,
      summary: "인물 '이서윤' 보관",
    })

    await revertChange(db, { userId: owner.id }, archive.id)

    expect((await currentEntry(entry.id)).archivedAt).toBeNull()
  })

  it('restores a chapter summary', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const chapter = await createTestChapter(db, work.id, { position: 1 })
    await db.update(chapters).set({ summary: '서윤이 떠난다.' }).where(eq(chapters.id, chapter.id))
    const change = await recordChange(db, {
      workId: work.id,
      targetTable: 'chapters',
      targetId: chapter.id,
      action: 'update',
      before: { ...chapter, summary: '' },
      after: { ...chapter, summary: '서윤이 떠난다.' },
      proposerType: 'ai',
      actorId: null,
      summary: '1화 요약 승인',
    })

    await revertChange(db, { userId: owner.id }, change.id)

    const [row] = await db.select().from(chapters).where(eq(chapters.id, chapter.id))
    expect(row.summary).toBe('')
  })

  it('restores thread links when the before snapshot carries relatedEntryIds', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const thread = await createTestThread(db, work.id, { title: '반지', status: 'planted' })
    await db.insert(threadEntries).values({ threadId: thread.id, entryId: entry.id })
    const before = { ...thread, relatedEntryIds: [entry.id] }
    await db.update(threads).set({ title: '반지의 비밀' }).where(eq(threads.id, thread.id))
    await db.delete(threadEntries).where(eq(threadEntries.threadId, thread.id))
    const change = await recordChange(db, {
      workId: work.id,
      targetTable: 'threads',
      targetId: thread.id,
      action: 'update',
      before,
      after: { ...thread, title: '반지의 비밀' },
      proposerType: 'author',
      actorId: owner.id,
      summary: '떡밥 수정',
    })

    await revertChange(db, { userId: owner.id }, change.id)

    const [row] = await db.select().from(threads).where(eq(threads.id, thread.id))
    expect(row.title).toBe('반지')
    const links = await db.select().from(threadEntries).where(eq(threadEntries.threadId, thread.id))
    expect(links.map((l) => l.entryId)).toEqual([entry.id])
  })

  it('rejects a revert when a later change exists for the same row', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '서윤' })
    const before = await currentEntry(entry.id)
    await db.update(wikiEntries).set({ name: '이서윤' }).where(eq(wikiEntries.id, entry.id))
    const first = await recordChange(db, {
      workId: work.id,
      targetTable: 'wiki_entries',
      targetId: entry.id,
      action: 'update',
      before,
      after: await currentEntry(entry.id),
      proposerType: 'author',
      actorId: owner.id,
      summary: '이름 변경',
    })
    // Pin the first change to an earlier time: two calls can read the same clock value.
    await db
      .update(changeLog)
      .set({ createdAt: sql`timestamptz '2026-10-16 04:59:00+00'` })
      .where(eq(changeLog.id, first.id))
    await recordChange(db, {
      workId: work.id,
      targetTable: 'wiki_entries',
      targetId: entry.id,
      action: 'update',
      before: await currentEntry(entry.id),
      after: await currentEntry(entry.id),
      proposerType: 'author',
      actorId: owner.id,
      summary: '요약 변경',
    })

    await expectAppError(
      revertChange(db, { userId: owner.id }, first.id),
      'CONFLICT',
      '이후 변경이 있어 먼저 그 변경을 되돌려야 합니다.',
    )
    expect((await currentEntry(entry.id)).name).toBe('이서윤')
  })

  it('rejects a viewer with FORBIDDEN and a stranger with NOT_FOUND', async () => {
    const owner = await createTestUser(db)
    const viewer = await createTestUser(db)
    const stranger = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const created = await recordChange(db, {
      workId: work.id,
      targetTable: 'wiki_entries',
      targetId: entry.id,
      action: 'create',
      before: null,
      after: entry,
      proposerType: 'author',
      actorId: owner.id,
      summary: "인물 '이서윤' 생성",
    })

    await expectAppError(revertChange(db, { userId: viewer.id }, created.id), 'FORBIDDEN')
    await expectAppError(revertChange(db, { userId: stranger.id }, created.id), 'NOT_FOUND')
    await expectAppError(
      revertChange(db, { userId: owner.id }, '00000000-0000-4000-8000-000000000000'),
      'NOT_FOUND',
    )
    expect((await currentEntry(entry.id)).archivedAt).toBeNull()
  })
})

async function changeOf(workId: string, targetId: string, action: string, actor: Actor) {
  const rows = await listChanges(db, actor, workId, { targetId })
  const found = rows.find((c) => c.action === action)
  if (!found) throw new Error(`no ${action} change for ${targetId}`)
  return found
}

async function factRow(factId: string) {
  const [row] = await db.select().from(facts).where(eq(facts.id, factId)).limit(1)
  return row
}

describe('revertChange keeps derived wiki data in line', () => {
  async function setupEntry() {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const actor = { userId: owner.id }
    await createTestChapter(db, work.id, { position: 1, body: '서윤은 웃었다.' })
    const entry = await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })
    return { actor, work, entry }
  }

  it('revert of archive restores the appearances that archiving removed', async () => {
    const { actor, work, entry } = await setupEntry()
    expect(await getEntryAppearances(db, entry.id)).toHaveLength(1)
    await archiveEntry(db, actor, entry.id)
    expect(await getEntryAppearances(db, entry.id)).toHaveLength(0)

    await revertChange(db, actor, (await changeOf(work.id, entry.id, 'archive', actor)).id)

    expect((await currentEntry(entry.id)).archivedAt).toBeNull()
    expect(await getEntryAppearances(db, entry.id)).toHaveLength(1)
  })

  it('revert of a rename recomputes appearances for the old name', async () => {
    const { actor, work, entry } = await setupEntry()
    await updateEntry(db, actor, entry.id, { name: '민준' })
    expect(await getEntryAppearances(db, entry.id)).toHaveLength(0)

    await revertChange(db, actor, (await changeOf(work.id, entry.id, 'update', actor)).id)

    expect((await currentEntry(entry.id)).name).toBe('서윤')
    expect(await getEntryAppearances(db, entry.id)).toHaveLength(1)
  })

  it('revert of create removes the appearances of the archived card', async () => {
    const { actor, work, entry } = await setupEntry()
    expect(await getEntryAppearances(db, entry.id)).toHaveLength(1)

    await revertChange(db, actor, (await changeOf(work.id, entry.id, 'create', actor)).id)

    expect((await currentEntry(entry.id)).archivedAt).not.toBeNull()
    expect(await getEntryAppearances(db, entry.id)).toHaveLength(0)
  })

  it('refuses to revert an archive when a same-named active card exists', async () => {
    const { actor, work, entry } = await setupEntry()
    await archiveEntry(db, actor, entry.id)
    const archive = await changeOf(work.id, entry.id, 'archive', actor)
    await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })

    await expectAppError(
      revertChange(db, actor, archive.id),
      'CONFLICT',
      '같은 이름의 카드가 이미 있습니다.',
    )
    expect((await currentEntry(entry.id)).archivedAt).not.toBeNull()
    const history = await listChanges(db, actor, work.id, { targetId: entry.id })
    expect(history.some((c) => c.action === 'revert')).toBe(false)
  })

  it('refuses to revert a rename when the old name is taken by another active card', async () => {
    const { actor, work, entry } = await setupEntry()
    await updateEntry(db, actor, entry.id, { name: '이서윤' })
    const rename = await changeOf(work.id, entry.id, 'update', actor)
    await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })

    await expectAppError(
      revertChange(db, actor, rename.id),
      'CONFLICT',
      '같은 이름의 카드가 이미 있습니다.',
    )
    expect((await currentEntry(entry.id)).name).toBe('이서윤')
  })

  it('revert of archive links unlinked facts whose subject matches the card', async () => {
    const { actor, work, entry } = await setupEntry()
    await archiveEntry(db, actor, entry.id)
    const fact = await createTestFact(db, work.id, { content: '서윤은 키가 크다.' })
    await db.update(facts).set({ subjectName: '서윤' }).where(eq(facts.id, fact.id))

    await revertChange(db, actor, (await changeOf(work.id, entry.id, 'archive', actor)).id)

    expect((await factRow(fact.id)).entryId).toBe(entry.id)
  })
})

describe('revertChange keeps replaced-fact chains consistent', () => {
  async function setupSupersede() {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const actor = { userId: owner.id }
    const old = await createTestFact(db, work.id, {
      content: '서윤의 나이는 17살이다.',
      validFromPosition: 1,
    })
    const { newFact } = await supersedeFact(db, actor, {
      factId: old.id,
      fromPosition: 12,
      content: '서윤의 나이는 18살이다.',
      status: 'confirmed',
    })
    return { actor, work, old, newFact }
  }

  it('reverting the replacement reopens the earlier fact, and undoing that restores the supersede', async () => {
    const { actor, work, old, newFact } = await setupSupersede()

    await revertChange(db, actor, (await changeOf(work.id, newFact.id, 'create', actor)).id)
    const reopened = await factRow(old.id)
    expect(reopened.validToPosition).toBeNull()
    expect(reopened.supersededByFactId).toBeNull()

    const undo = (await listChanges(db, actor, work.id, { targetId: newFact.id }))[0]
    await revertChange(db, actor, undo.id)
    const restored = await factRow(old.id)
    expect(restored.validToPosition).toBe(11)
    expect(restored.supersededByFactId).toBe(newFact.id)
    expect((await factRow(newFact.id)).archivedAt).toBeNull()
  })

  it('refuses to revert the earlier fact while its replacement is live', async () => {
    const { actor, work, old, newFact } = await setupSupersede()
    const earlier = await changeOf(work.id, old.id, 'update', actor)

    await expectAppError(
      revertChange(db, actor, earlier.id),
      'CONFLICT',
      '이 사실을 대체한 새 사실이 있어 먼저 새 사실의 추가를 되돌려야 합니다.',
    )
    expect((await factRow(old.id)).supersededByFactId).toBe(newFact.id)
  })

  it('reverting the archive of the replacement re-links the earlier fact', async () => {
    const { actor, work, old, newFact } = await setupSupersede()
    await archiveFact(db, actor, newFact.id)
    expect((await factRow(old.id)).supersededByFactId).toBeNull()

    await revertChange(db, actor, (await changeOf(work.id, newFact.id, 'archive', actor)).id)

    const relinked = await factRow(old.id)
    expect(relinked.supersededByFactId).toBe(newFact.id)
    expect(relinked.validToPosition).toBe(11)
    const valid = factsValidAt(await listFacts(db, actor, work.id, { includeSuperseded: true }), 12)
    expect(valid.map((f) => f.id)).toEqual([newFact.id])
  })
})

describe('revertChange on thread links', () => {
  it('undoing a revert restores the related cards of the thread', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const actor = { userId: owner.id }
    const a = await createTestEntry(db, work.id, { name: '서윤' })
    const b = await createTestEntry(db, work.id, { name: '민준' })
    const thread = await createThread(db, actor, {
      workId: work.id,
      title: '반지',
      status: 'planned',
      relatedEntryIds: [a.id, b.id],
    })
    await updateThread(db, actor, thread.id, { relatedEntryIds: [a.id] })
    const links = async () =>
      (await db.select().from(threadEntries).where(eq(threadEntries.threadId, thread.id)))
        .map((l) => l.entryId)
        .sort()

    await revertChange(
      db,
      actor,
      (await listChanges(db, actor, work.id, { targetId: thread.id }))[0].id,
    )
    expect(await links()).toEqual([a.id, b.id].sort())

    await revertChange(
      db,
      actor,
      (await listChanges(db, actor, work.id, { targetId: thread.id }))[0].id,
    )
    expect(await links()).toEqual([a.id])
  })

  it('reverting a timeline event re-derives the thread status, and undoing it resolves again', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const actor = { userId: owner.id }
    const ch1 = await createTestChapter(db, work.id, { position: 1 })
    const ch3 = await createTestChapter(db, work.id, { position: 3 })
    const thread = await createThread(db, actor, {
      workId: work.id,
      title: '반지',
      status: 'planted',
      plantedChapterId: ch1.id,
    })
    await addThreadEvent(db, actor, { threadId: thread.id, kind: 'resolved', chapterId: ch3.id })

    // Newest thread_events change is the resolving event's create row.
    const eventCreate = (await listChanges(db, actor, work.id, { targetTable: 'thread_events' }))[0]
    expect(eventCreate.action).toBe('create')
    await revertChange(db, actor, eventCreate.id)
    let row = await db.select().from(threads).where(eq(threads.id, thread.id)).limit(1)
    expect(row[0].status).toBe('planted')
    expect(row[0].resolvedChapterId).toBeNull()
    await addThreadEvent(db, actor, { threadId: thread.id, kind: 'resolved', chapterId: ch3.id })

    row = await db.select().from(threads).where(eq(threads.id, thread.id)).limit(1)
    expect(row[0].status).toBe('resolved')
  })
})

describe('revertChange on changes that share a timestamp', () => {
  // Two updates to one entry with the same created_at. The id decides which one is newest,
  // the same (created_at, id) order listChanges uses for its revertable flag.
  async function tiedChanges(workId: string, targetId: string, actorId: string) {
    const [low, high] = [randomUUID(), randomUUID()].sort()
    const stamp = sql`timestamptz '2026-10-16 05:00:00+00'`
    // The higher id is inserted first, so heap order alone does not give the newest row.
    for (const id of [high, low]) {
      await db.insert(changeLog).values({
        id,
        workId,
        targetTable: 'wiki_entries',
        targetId,
        action: 'update',
        before: { summary: `이전 요약 ${id.slice(0, 4)}` },
        after: null,
        proposerType: 'author',
        actorId,
        summary: `변경 ${id.slice(0, 4)}`,
        createdAt: stamp,
      })
    }
    return { low, high }
  }

  it('reverts the change that listChanges marks as the newest', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const { high } = await tiedChanges(work.id, entry.id, owner.id)

    const rows = await listChanges(db, { userId: owner.id }, work.id)
    expect(rows.find((r) => r.id === high)?.revertable).toBe(true)

    const reverted = await revertChange(db, { userId: owner.id }, high)
    expect(reverted.action).toBe('revert')
    expect(reverted.revertsChangeId).toBe(high)
  })

  it('refuses an older change that shares the timestamp with a later one', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const { low } = await tiedChanges(work.id, entry.id, owner.id)

    const rows = await listChanges(db, { userId: owner.id }, work.id)
    expect(rows.find((r) => r.id === low)?.revertable).toBe(false)

    await expectAppError(
      revertChange(db, { userId: owner.id }, low),
      'CONFLICT',
      '이후 변경이 있어 먼저 그 변경을 되돌려야 합니다.',
    )
  })
})
