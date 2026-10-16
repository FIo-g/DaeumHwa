import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestChapter, createTestUser, createTestWork } from '@/test/factories'

const mocks = vi.hoisted(() => ({
  db: null as Db | null,
  userId: '' as string,
  revalidatePath: vi.fn(),
}))

vi.mock('@/db/client', () => ({ getDb: () => mocks.db }))
vi.mock('@/server/session', () => ({
  requireUser: async () => {
    if (!mocks.userId)
      throw new (await import('@/lib/errors')).AppError('UNAUTHENTICATED', '로그인이 필요합니다.')
    return { id: mocks.userId, name: '작가', email: 'a@test.local' }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  getVersionAction,
  restoreVersionAction,
  saveChapterAction,
  saveResumePointAction,
} from './manuscript'
import { createChapterAction, openNextChapterAction, setChapterSummaryAction } from './chapters'
import { createChapter, listVersions } from '@/server/chapters'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
  mocks.db = db
  mocks.userId = ''
  mocks.revalidatePath.mockClear()
})

describe('chapter actions', () => {
  it('returns UNAUTHENTICATED when signed out', async () => {
    const result = await createChapterAction({ workId: '00000000-0000-4000-8000-000000000000' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' },
    })
  })

  it('rejects malformed input with VALIDATION', async () => {
    const owner = await createTestUser(db)
    mocks.userId = owner.id
    const result = await createChapterAction({ workId: 'not-a-uuid' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: '입력값이 올바르지 않습니다.' },
    })
  })

  it('creates a chapter and revalidates the work', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    mocks.userId = owner.id
    const result = await createChapterAction({ workId: work.id })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.title).toBe('1화')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/works/${work.id}`, 'layout')
  })

  it('opens the next chapter and reports whether it was created', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    mocks.userId = owner.id
    const first = await openNextChapterAction({ workId: work.id })
    expect(first).toMatchObject({ ok: true, data: { created: true } })
    const second = await openNextChapterAction({ workId: work.id })
    expect(second).toMatchObject({ ok: true, data: { created: false } })
  })

  it('stores an author summary with proposerType author', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const chapter = await createTestChapter(db, work.id, { position: 1 })
    mocks.userId = owner.id
    const result = await setChapterSummaryAction({ chapterId: chapter.id, summary: '요약' })
    expect(result).toMatchObject({ ok: true, data: { summary: '요약' } })
  })
})

describe('manuscript actions', () => {
  it('saves a chapter and returns the new version and counts', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const chapter = await createTestChapter(db, work.id, { position: 1 })
    mocks.userId = owner.id
    const result = await saveChapterAction({
      chapterId: chapter.id,
      body: '가 나\n다',
      expectedVersion: 1,
    })
    expect(result).toMatchObject({
      ok: true,
      data: { version: 2, charCount: 4, charCountNoSpaces: 3 },
    })
    if (result.ok) expect(typeof result.data.updatedAt).toBe('string')
  })

  it('returns CONFLICT with the message on a stale version', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const chapter = await createTestChapter(db, work.id, { position: 1 })
    mocks.userId = owner.id
    await saveChapterAction({ chapterId: chapter.id, body: 'a', expectedVersion: 1 })
    const stale = await saveChapterAction({ chapterId: chapter.id, body: 'b', expectedVersion: 1 })
    expect(stale).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: '다른 곳에서 먼저 수정된 원고가 있습니다.',
        details: { currentVersion: 2 },
      },
    })
  })

  it('rejects source restore on a plain save', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const chapter = await createTestChapter(db, work.id, { position: 1 })
    mocks.userId = owner.id
    const result = await saveChapterAction({
      chapterId: chapter.id,
      expectedVersion: 1,
      source: 'restore',
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('restores a version and gets a version by id', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const chapter = await createChapter(db, { userId: owner.id }, { workId: work.id, body: '처음' })
    mocks.userId = owner.id
    await saveChapterAction({ chapterId: chapter.id, body: '나중', expectedVersion: 1 })
    const versions = await listVersions(db, { userId: owner.id }, chapter.id)
    const oldest = versions[versions.length - 1]
    const got = await getVersionAction({ versionId: oldest.id })
    expect(got).toMatchObject({ ok: true, data: { body: '처음' } })
    const restored = await restoreVersionAction({ versionId: oldest.id, expectedVersion: 2 })
    expect(restored).toMatchObject({ ok: true, data: { body: '처음', version: 3 } })
  })

  it('a viewer gets FORBIDDEN when restoring', async () => {
    const owner = await createTestUser(db)
    const viewer = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    const chapter = await createChapter(db, { userId: owner.id }, { workId: work.id, body: '처음' })
    const versions = await listVersions(db, { userId: owner.id }, chapter.id)
    mocks.userId = viewer.id
    const result = await restoreVersionAction({ versionId: versions[0].id, expectedVersion: 1 })
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('saves a resume point for a path that starts with a slash', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    mocks.userId = owner.id
    expect(await saveResumePointAction({ workId: work.id, path: '/works/x' })).toEqual({
      ok: true,
      data: undefined,
    })
    expect(await saveResumePointAction({ workId: work.id, path: 'works/x' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
  })
})
