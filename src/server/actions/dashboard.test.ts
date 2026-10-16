import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'

const mocks = vi.hoisted(() => ({
  db: null as Db | null,
  userId: '' as string,
}))

vi.mock('@/db/client', () => ({ getDb: () => mocks.db }))
vi.mock('@/server/session', () => ({
  requireUser: async () => {
    if (!mocks.userId)
      throw new (await import('@/lib/errors')).AppError('UNAUTHENTICATED', '로그인이 필요합니다.')
    return { id: mocks.userId, name: '작가', email: 'a@test.local' }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getAlertsAction } from './dashboard'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
  mocks.db = db
  mocks.userId = ''
})

describe('dashboard actions', () => {
  it('returns UNAUTHENTICATED when signed out', async () => {
    const result = await getAlertsAction({ workId: crypto.randomUUID() })
    expect(result).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' },
    })
  })

  it('rejects a malformed work id with VALIDATION', async () => {
    const owner = await createTestUser(db)
    mocks.userId = owner.id
    const result = await getAlertsAction({ workId: 'not-a-uuid' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
  })

  it('returns the periodic alerts for a member', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    for (let position = 1; position <= 8; position++) {
      await createTestChapter(db, work.id, { position, status: 'done' })
    }
    await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      targetChapterPosition: 6,
    })
    mocks.userId = owner.id

    const result = await getAlertsAction({ workId: work.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.overdueThreads).toHaveLength(1)
    expect(result.data.total).toBe(1)
  })

  it('returns NOT_FOUND for a work the caller does not belong to', async () => {
    const owner = await createTestUser(db)
    const stranger = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    mocks.userId = stranger.id

    const result = await getAlertsAction({ workId: work.id })

    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: '작품을 찾을 수 없습니다.' },
    })
  })
})
