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
    if (!state.user) throw new AppError('UNAUTHENTICATED', '로그인이 필요합니다.')
    return state.user
  },
}))

vi.mock('@/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/client')>()),
  getDb: () => state.db as Db,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { runProofreadAction } = await import('./checks')

describe('runProofreadAction input rules', () => {
  let chapterId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    chapterId = (await createTestChapter(db, work.id, { body: '본문' })).id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
  })

  it('accepts text at the 200000-character limit', async () => {
    const result = await runProofreadAction({
      chapterId,
      text: '가'.repeat(200_000),
      useAi: false,
    })
    expect(result).toMatchObject({ ok: true, data: { runId: null } })
  })

  it('rejects text over the 200000-character limit with VALIDATION', async () => {
    const result = await runProofreadAction({
      chapterId,
      text: '가'.repeat(200_001),
      useAi: false,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: '입력값이 올바르지 않습니다.' },
    })
  })
})
