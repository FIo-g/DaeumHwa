import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { eq } from 'drizzle-orm'
import { works, workMembers } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { createChapter, archiveChapter } from './chapters'
import { getResumePoint, saveResumePoint } from './user-state'

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

describe('saveResumePoint and getResumePoint', () => {
  it('saves the chapter and cursor, then reads them back with titles', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }
    const work = await createTestWork(db, owner.id, { title: '별빛 연대기' })
    const chapter = await createTestChapter(db, work.id, { position: 3, title: '재회' })

    await saveResumePoint(db, actor, {
      workId: work.id,
      chapterId: chapter.id,
      cursor: 42,
      path: `/works/${work.id}/chapters/${chapter.id}`,
    })
    const point = await getResumePoint(db, actor, work.id)
    expect(point).toMatchObject({
      workId: work.id,
      workTitle: '별빛 연대기',
      chapterId: chapter.id,
      chapterTitle: '재회',
      chapterPosition: 3,
      cursor: 42,
      path: `/works/${work.id}/chapters/${chapter.id}`,
    })
    expect(point?.updatedAt).toBeInstanceOf(Date)
  })

  it('upserts: a second save replaces the first', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }
    const work = await createTestWork(db, owner.id)
    const a = await createTestChapter(db, work.id, { position: 1 })
    const b = await createTestChapter(db, work.id, { position: 2 })
    await saveResumePoint(db, actor, { workId: work.id, chapterId: a.id, path: '/a' })
    await saveResumePoint(db, actor, { workId: work.id, chapterId: b.id, cursor: 7, path: '/b' })
    const point = await getResumePoint(db, actor, work.id)
    expect(point?.chapterId).toBe(b.id)
    expect(point?.cursor).toBe(7)
    expect(point?.path).toBe('/b')
  })

  it('keeps the previous chapter when chapterId is omitted, and clears it on null', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }
    const work = await createTestWork(db, owner.id)
    const chapter = await createTestChapter(db, work.id, { position: 1 })
    await saveResumePoint(db, actor, { workId: work.id, chapterId: chapter.id, path: '/x' })
    await saveResumePoint(db, actor, { workId: work.id, path: '/list' })
    expect((await getResumePoint(db, actor, work.id))?.chapterId).toBe(chapter.id)
    await saveResumePoint(db, actor, { workId: work.id, chapterId: null, path: '/list' })
    expect((await getResumePoint(db, actor, work.id))?.chapterId).toBeNull()
  })

  it('a chapter from another work is NOT_FOUND', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }
    const workA = await createTestWork(db, owner.id, { title: 'A' })
    const workB = await createTestWork(db, owner.id, { title: 'B' })
    const chapterB = await createTestChapter(db, workB.id, { position: 1 })
    await expectAppError(
      saveResumePoint(db, actor, { workId: workA.id, chapterId: chapterB.id, path: '/x' }),
      'NOT_FOUND',
    )
  })

  it('a non-member cannot save or read a resume point', async () => {
    const owner = await createTestUser(db)
    const stranger = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await expectAppError(
      saveResumePoint(db, { userId: stranger.id }, { workId: work.id, path: '/x' }),
      'NOT_FOUND',
    )
    await expectAppError(getResumePoint(db, { userId: stranger.id }, work.id), 'NOT_FOUND')
  })

  it('without workId returns the latest point across my works', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }
    const older = await createTestWork(db, owner.id, { title: '오래된 작품' })
    const newer = await createTestWork(db, owner.id, { title: '최근 작품' })
    await saveResumePoint(db, actor, { workId: newer.id, path: '/new' })
    await saveResumePoint(db, actor, { workId: older.id, path: '/old' })
    const point = await getResumePoint(db, actor)
    expect(point?.workId).toBe(older.id)
    expect(point?.path).toBe('/old')
  })

  it('skips archived works', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }
    const active = await createTestWork(db, owner.id, { title: '활성' })
    const archived = await createTestWork(db, owner.id, { title: '보관' })
    await saveResumePoint(db, actor, { workId: active.id, path: '/active' })
    await saveResumePoint(db, actor, { workId: archived.id, path: '/archived' })
    await db.update(works).set({ status: 'archived' }).where(eq(works.id, archived.id))
    const point = await getResumePoint(db, actor)
    expect(point?.workId).toBe(active.id)
  })

  it('skips works I am no longer a member of', async () => {
    const owner = await createTestUser(db)
    const member = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await addTestMember(db, work.id, member.id, 'viewer')
    await saveResumePoint(db, { userId: member.id }, { workId: work.id, path: '/x' })
    await db.delete(workMembers).where(eq(workMembers.userId, member.id))
    expect(await getResumePoint(db, { userId: member.id })).toBeNull()
  })

  it('reports no chapter when the saved chapter is archived', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }
    const work = await createTestWork(db, owner.id)
    const chapter = await createChapter(db, actor, { workId: work.id, body: 'x' })
    await saveResumePoint(db, actor, {
      workId: work.id,
      chapterId: chapter.id,
      cursor: 1,
      path: '/c',
    })
    await archiveChapter(db, actor, chapter.id)
    const point = await getResumePoint(db, actor, work.id)
    expect(point).toMatchObject({
      chapterId: null,
      chapterTitle: null,
      chapterPosition: null,
      cursor: null,
      path: '/c',
    })
  })

  it('returns null when nothing was saved', async () => {
    const owner = await createTestUser(db)
    await createTestWork(db, owner.id)
    expect(await getResumePoint(db, { userId: owner.id })).toBeNull()
  })
})
