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

function request(payload: unknown = { text: '되요 원고.', useAi: false }): Request {
  return new Request('http://localhost/api/works/x/chapters/y/proofread', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

describe('POST /api/works/[workId]/chapters/[chapterId]/proofread', () => {
  let workId: string
  let chapterId: string
  let otherChapterId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    chapterId = (await createTestChapter(db, work.id, { body: '서윤은 왼손에 검을 쥐었다.' })).id
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
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })

  it('runs for an editor and returns the result', async () => {
    const res = await POST(request(), context({ workId, chapterId }))
    expect(await res.json()).toMatchObject({ ok: true, data: { suggestions: expect.any(Array) } })
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

  it('accepts text at exactly the 200000-character input limit', async () => {
    const res = await POST(
      request({ text: '가'.repeat(200_000), useAi: false }),
      context({ workId, chapterId }),
    )
    expect(await res.json()).toMatchObject({ ok: true, data: { suggestions: expect.any(Array) } })
  })

  it('rejects text over the 200000-character input limit with VALIDATION', async () => {
    const res = await POST(
      request({ text: '가'.repeat(200_001), useAi: false }),
      context({ workId, chapterId }),
    )
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: '입력값이 올바르지 않습니다.' },
    })
  })

  it('rejects AI proofreading of text over the 30000-character AI limit with the service message', async () => {
    const res = await POST(
      request({ text: '가'.repeat(30_001), useAi: true }),
      context({ workId, chapterId }),
    )
    expect(await res.json()).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('너무 깁니다') },
    })
  })
})
