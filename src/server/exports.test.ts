import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import {
  changeLog,
  chapters,
  namingRules,
  relations,
  scheduleItems,
  styleCards,
  threadEntries,
  threadEvents,
} from '@/db/schema'
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
import { buildExportPayload } from './exports'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function expectAppError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
}

/** Creates one work with a row in every exported table. Returns the ids it created. */
async function seedWork(ownerId: string, title: string) {
  const work = await createTestWork(db, ownerId, { title })
  const chapter = await createTestChapter(db, work.id, { position: 1, title: '1화', body: '본문' })
  const archivedChapter = await createTestChapter(db, work.id, {
    position: 2,
    title: '보관된 2화',
    body: '지운 원고',
  })
  await db
    .update(chapters)
    .set({ archivedAt: new Date() })
    .where(eq(chapters.id, archivedChapter.id))

  const seoa = await createTestEntry(db, work.id, { name: '서아' })
  const archivedEntry = await createTestEntry(db, work.id, { name: '보관된 인물' })
  const fact = await createTestFact(db, work.id, {
    content: '서아는 검을 쓴다',
    entryId: seoa.id,
    sourceChapterId: chapter.id,
  })
  const thread = await createTestThread(db, work.id, {
    title: '검의 행방',
    plantedChapterId: chapter.id,
  })
  await db.insert(threadEntries).values({ threadId: thread.id, entryId: seoa.id })
  await db.insert(threadEvents).values({
    threadId: thread.id,
    kind: 'planted',
    chapterId: chapter.id,
    note: '심음',
  })
  await db.insert(relations).values({
    workId: work.id,
    sourceEntryId: seoa.id,
    targetEntryId: archivedEntry.id,
    kind: '친구',
  })
  await db.insert(namingRules).values({ workId: work.id, canonical: '서아', variants: ['서하'] })
  await db.insert(styleCards).values({ workId: work.id, name: '서아 말투', tone: '짧게' })
  await db.insert(changeLog).values({
    workId: work.id,
    targetTable: 'facts',
    targetId: fact.id,
    action: 'create',
    proposerType: 'author',
    summary: '사실 추가',
  })
  await db.insert(scheduleItems).values({
    workId: work.id,
    kind: 'deadline',
    title: '1권 마감',
    date: '2026-10-30',
  })

  return { work, chapter, archivedChapter, seoa, archivedEntry, fact, thread }
}

describe('buildExportPayload', () => {
  it('returns the backup format header, version 1 and an ISO exportedAt', async () => {
    const owner = await createTestUser(db)
    const { work } = await seedWork(owner.id, '별빛 연대기')
    const before = Date.now()
    const payload = await buildExportPayload(db, { userId: owner.id }, work.id)
    expect(payload.format).toBe('daeumhwa-backup')
    expect(payload.version).toBe(1)
    expect(payload.work.id).toBe(work.id)
    expect(payload.work.title).toBe('별빛 연대기')
    const exportedMs = Date.parse(payload.exportedAt)
    expect(Number.isNaN(exportedMs)).toBe(false)
    expect(payload.exportedAt).toBe(new Date(exportedMs).toISOString())
    expect(exportedMs).toBeGreaterThanOrEqual(before - 1000)
  })

  it('includes every row of the work, archived rows too', async () => {
    const owner = await createTestUser(db)
    const { work, chapter, archivedChapter, seoa, archivedEntry, fact, thread } = await seedWork(
      owner.id,
      '작품',
    )
    const payload = await buildExportPayload(db, { userId: owner.id }, work.id)

    expect(payload.chapters.map((c) => c.id).sort()).toEqual(
      [chapter.id, archivedChapter.id].sort(),
    )
    expect(payload.chapters.find((c) => c.id === archivedChapter.id)?.archivedAt).not.toBeNull()
    expect(payload.chapters.find((c) => c.id === chapter.id)?.body).toBe('본문')
    expect(payload.entries.map((e) => e.id).sort()).toEqual([seoa.id, archivedEntry.id].sort())
    expect(payload.facts.map((f) => f.id)).toEqual([fact.id])
    expect(payload.threads.map((t) => t.id)).toEqual([thread.id])
    expect(payload.threadEvents).toHaveLength(1)
    expect(payload.threadEvents[0].threadId).toBe(thread.id)
    expect(payload.threadEntries).toEqual([{ threadId: thread.id, entryId: seoa.id }])
    expect(payload.relations).toHaveLength(1)
    expect(payload.namingRules.map((r) => r.canonical)).toEqual(['서아'])
    expect(payload.styleCards.map((s) => s.name)).toEqual(['서아 말투'])
    expect(payload.changes.map((c) => c.summary)).toEqual(['사실 추가'])
    expect(payload.scheduleItems.map((s) => s.title)).toEqual(['1권 마감'])
  })

  it('never includes rows of another work', async () => {
    const owner = await createTestUser(db)
    const mine = await seedWork(owner.id, '내 작품')
    const theirs = await seedWork(owner.id, '다른 작품')

    const payload = await buildExportPayload(db, { userId: owner.id }, mine.work.id)

    const chapterIds = payload.chapters.map((c) => c.id)
    expect(chapterIds).not.toContain(theirs.chapter.id)
    expect(payload.entries.map((e) => e.id)).not.toContain(theirs.seoa.id)
    expect(payload.facts.map((f) => f.id)).not.toContain(theirs.fact.id)
    expect(payload.threads.map((t) => t.id)).not.toContain(theirs.thread.id)
    expect(payload.threadEntries.map((t) => t.threadId)).not.toContain(theirs.thread.id)
    expect(payload.threadEvents.map((e) => e.threadId)).not.toContain(theirs.thread.id)
    expect(payload.changes.every((c) => c.workId === mine.work.id)).toBe(true)
    expect(payload.scheduleItems.every((s) => s.workId === mine.work.id)).toBe(true)
    expect(payload.styleCards.every((s) => s.workId === mine.work.id)).toBe(true)
    expect(payload.namingRules.every((r) => r.workId === mine.work.id)).toBe(true)
    expect(payload.relations.every((r) => r.workId === mine.work.id)).toBe(true)
  })

  it('returns empty arrays for a work with no rows yet', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const payload = await buildExportPayload(db, { userId: owner.id }, work.id)
    expect(payload.chapters).toEqual([])
    expect(payload.entries).toEqual([])
    expect(payload.facts).toEqual([])
    expect(payload.threads).toEqual([])
    expect(payload.threadEvents).toEqual([])
    expect(payload.threadEntries).toEqual([])
    expect(payload.relations).toEqual([])
    expect(payload.namingRules).toEqual([])
    expect(payload.styleCards).toEqual([])
    expect(payload.changes).toEqual([])
    expect(payload.scheduleItems).toEqual([])
  })

  it('rejects an editor with FORBIDDEN (owner only)', async () => {
    const owner = await createTestUser(db)
    const editor = await createTestUser(db)
    const { work } = await seedWork(owner.id, '작품')
    await addTestMember(db, work.id, editor.id, 'editor')
    await expectAppError(buildExportPayload(db, { userId: editor.id }, work.id), 'FORBIDDEN')
  })

  it('rejects a commenter and a viewer with FORBIDDEN', async () => {
    const owner = await createTestUser(db)
    const commenter = await createTestUser(db)
    const viewer = await createTestUser(db)
    const { work } = await seedWork(owner.id, '작품')
    await addTestMember(db, work.id, commenter.id, 'commenter')
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expectAppError(buildExportPayload(db, { userId: commenter.id }, work.id), 'FORBIDDEN')
    await expectAppError(buildExportPayload(db, { userId: viewer.id }, work.id), 'FORBIDDEN')
  })

  it('gives a non-member NOT_FOUND, never a hint that the work exists', async () => {
    const owner = await createTestUser(db)
    const stranger = await createTestUser(db)
    const { work } = await seedWork(owner.id, '작품')
    await expectAppError(buildExportPayload(db, { userId: stranger.id }, work.id), 'NOT_FOUND')
  })

  it('gives NOT_FOUND for a work id that does not exist or is malformed', async () => {
    const owner = await createTestUser(db)
    await expectAppError(
      buildExportPayload(db, { userId: owner.id }, '00000000-0000-4000-8000-000000000000'),
      'NOT_FOUND',
    )
    await expectAppError(buildExportPayload(db, { userId: owner.id }, 'not-a-uuid'), 'NOT_FOUND')
  })
})
