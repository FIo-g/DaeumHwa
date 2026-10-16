import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'

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

import { createWorkAction, setWorkArchivedAction, updateWorkAction } from './works'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
  mocks.db = db
  mocks.userId = ''
  mocks.revalidatePath.mockClear()
})

describe('works actions', () => {
  it('returns UNAUTHENTICATED when signed out', async () => {
    const result = await createWorkAction({ title: '별빛' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' },
    })
  })

  it('creates a work, revalidates its pages and returns it', async () => {
    const owner = await createTestUser(db)
    mocks.userId = owner.id
    const result = await createWorkAction({ title: '  별빛 연대기  ', genre: '판타지' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.title).toBe('별빛 연대기')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/works/${result.data.id}`, 'layout')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/works')
  })

  it('returns VALIDATION for bad input without throwing', async () => {
    const owner = await createTestUser(db)
    mocks.userId = owner.id
    const result = await createWorkAction({ title: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
  })

  it('returns FORBIDDEN for a viewer updating the work', async () => {
    const owner = await createTestUser(db)
    const viewer = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    mocks.userId = viewer.id
    const result = await updateWorkAction({ workId: work.id, title: '바꿈' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: '이 작업을 할 권한이 없습니다.' },
    })
  })

  it('archives a work through the owner', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    mocks.userId = owner.id
    const result = await setWorkArchivedAction({ workId: work.id, archived: true })
    expect(result.ok && result.data.status).toBe('archived')
  })
})
