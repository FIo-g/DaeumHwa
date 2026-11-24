import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as { id: string; name: string; email: string } | null,
}))

vi.mock('@/server/session', () => ({
  getSessionUser: async () => state.user,
  requireUser: async () => {
    if (!state.user) throw new AppError('UNAUTHENTICATED', '로그인이 필요해요.')
    return state.user
  },
}))

vi.mock('@/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/client')>()),
  getDb: () => state.db as Db,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getCheckContextAction } = await import('./checks')

describe('getCheckContextAction input rules', () => {
  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await createTestChapter(db, work.id, { body: '본문' })
    state.user = { id: owner.id, name: owner.name, email: owner.email }
  })

  it('rejects an invalid chapter id with VALIDATION', async () => {
    const result = await getCheckContextAction({ chapterId: 'not-a-uuid' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: '입력값이 올바르지 않아요.' },
    })
  })
})
