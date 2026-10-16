import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { chapters, threadEntries, threads, wikiEntries } from '@/db/schema'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { AppError } from '@/lib/errors'
import { listChanges, recordChange, revertChange } from './changes'

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
