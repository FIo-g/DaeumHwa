import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { setAiClientForTests } from '@/ai'
import { AppError } from '@/lib/errors'
import type { Db } from '@/db/client'
import { interviewTurns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import { askNextQuestion, startInterview } from '@/server/interview'

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

function request(body: unknown): Request {
  return new Request('http://localhost/api/works/x/interview/next', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/works/[workId]/interview/next', () => {
  let workId: string
  let sessionId: string
  let otherSessionId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const other = await createTestWork(db, owner.id, { title: '다른 작품' })
    workId = work.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
    setAiClientForTests(new FakeAiClient())
    sessionId = (await startInterview(db, { userId: owner.id }, work.id)).id
    otherSessionId = (await startInterview(db, { userId: owner.id }, other.id)).id
  })

  function context(path: { workId: string }) {
    return { params: Promise.resolve(path) }
  }

  it('returns an UNAUTHENTICATED result when signed out', async () => {
    state.user = null
    const res = await POST(request({ sessionId }), context({ workId }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })

  it('returns the question turn for an editor, without caching', async () => {
    const res = await POST(request({ sessionId }), context({ workId }))
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toMatchObject({
      ok: true,
      data: { sessionId, topic: '주인공', answer: null, focus: 'setting' },
    })
  })

  it('returns NOT_FOUND for a session of another work', async () => {
    const res = await POST(request({ sessionId: otherSessionId }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('returns NOT_FOUND for a user who is not a member', async () => {
    const stranger = await createTestUser(state.db as Db, { email: 'stranger@example.com' })
    state.user = { id: stranger.id, name: stranger.name, email: stranger.email }
    const res = await POST(request({ sessionId }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('returns FORBIDDEN for a viewer', async () => {
    const viewer = await createTestUser(state.db as Db, { email: 'viewer@example.com' })
    await addTestMember(state.db as Db, workId, viewer.id, 'viewer')
    state.user = { id: viewer.id, name: viewer.name, email: viewer.email }
    const res = await POST(request({ sessionId }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('returns VALIDATION when the session id is not a uuid', async () => {
    const res = await POST(request({ sessionId: 'nope' }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('returns CANCELLED and inserts no turn when the request signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const req = new Request('http://localhost/api/works/x/interview/next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
      signal: controller.signal,
    })
    const res = await POST(req, context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
    const turns = await (state.db as Db)
      .select()
      .from(interviewTurns)
      .where(eq(interviewTurns.sessionId, sessionId))
    expect(turns).toHaveLength(0)
  })

  it('returns the open turn instead of asking again', async () => {
    const db = state.db as Db
    const owner = state.user as { id: string }
    const existing = await askNextQuestion(db, { userId: owner.id }, sessionId, new FakeAiClient())
    const res = await POST(request({ sessionId }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: true, data: { id: existing.id } })
  })
})
