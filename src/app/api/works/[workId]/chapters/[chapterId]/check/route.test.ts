import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/ai/fake'
import { setAiClientForTests } from '@/ai'
import { AppError } from '@/lib/errors'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestChapter, createTestUser, createTestWork } from '@/test/factories'

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

const { POST } = await import('./route')

function request(): Request {
  return new Request('http://localhost/api/works/x/chapters/y/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
}

describe('POST /api/works/[workId]/chapters/[chapterId]/check', () => {
  let workId: string
  let chapterId: string
  let otherChapterId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    const chapter = await createTestChapter(db, work.id, { body: '서윤은 왼손에 검을 쥐었다.' })
    chapterId = chapter.id
    const otherWork = await createTestWork(db, owner.id, { title: '다른 작품' })
    otherChapterId = (await createTestChapter(db, otherWork.id, { body: '본문' })).id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
    setAiClientForTests(new FakeAiClient())
  })

  function context(path: { workId: string; chapterId: string }) {
    return { params: Promise.resolve(path) }
  }

  it('returns an UNAUTHENTICATED result when signed out', async () => {
    state.user = null
    const res = await POST(request(), context({ workId, chapterId }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })

  it('runs the check for an editor and returns the result', async () => {
    const res = await POST(request(), context({ workId, chapterId }))
    expect(await res.json()).toMatchObject({ ok: true, data: { issues: expect.any(Array) } })
  })

  it('returns NOT_FOUND for a user who is not a member', async () => {
    const stranger = await createTestUser(state.db as Db, { email: 'stranger@example.com' })
    state.user = { id: stranger.id, name: stranger.name, email: stranger.email }
    const res = await POST(request(), context({ workId, chapterId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('returns NOT_FOUND when the chapter belongs to another work', async () => {
    const res = await POST(request(), context({ workId, chapterId: otherChapterId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('returns FORBIDDEN for a viewer', async () => {
    const viewer = await createTestUser(state.db as Db, { email: 'viewer@example.com' })
    await addTestMember(state.db as Db, workId, viewer.id, 'viewer')
    state.user = { id: viewer.id, name: viewer.name, email: viewer.email }
    const res = await POST(request(), context({ workId, chapterId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
