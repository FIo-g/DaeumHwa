import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'

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

const { createDirectiveAction } = await import('./wiki')

describe('createDirectiveAction limits', () => {
  let workId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
  })

  // Lengths past the zod caps reach the service, which gives the Korean message for the limit.
  it('reports the 300-character request limit for a longer request text', async () => {
    const result = await createDirectiveAction({
      workId,
      scope: 'work',
      kind: 'content',
      text: '가'.repeat(400),
      source: 'instruction',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('요청은 300자까지 적을 수 있습니다.')
  })

  it('reports the 100-character pattern limit for a longer ban pattern', async () => {
    const result = await createDirectiveAction({
      workId,
      scope: 'work',
      kind: 'ban',
      text: '쓰지 말 것',
      pattern: '가'.repeat(120),
      source: 'author',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('찾을 말은 100자까지 적을 수 있습니다.')
  })
})
