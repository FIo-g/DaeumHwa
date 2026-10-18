import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { setAiClientForTests } from '@/ai'
import { AppError } from '@/lib/errors'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
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
  return new Request('http://localhost/api/works/x/interview/answer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/works/[workId]/interview/answer', () => {
  let workId: string
  let turnId: string
  let otherTurnId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const other = await createTestWork(db, owner.id, { title: '다른 작품' })
    workId = work.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
    setAiClientForTests(new FakeAiClient())
    const actor = { userId: owner.id }
    const session = await startInterview(db, actor, work.id)
    turnId = (await askNextQuestion(db, actor, session.id, new FakeAiClient())).id
    const otherSession = await startInterview(db, actor, other.id)
    otherTurnId = (await askNextQuestion(db, actor, otherSession.id, new FakeAiClient())).id
  })

  function context(path: { workId: string }) {
    return { params: Promise.resolve(path) }
  }

  it('returns an UNAUTHENTICATED result when signed out', async () => {
    state.user = null
    const res = await POST(request({ turnId, answer: '답' }), context({ workId }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })

  it('stores the answer and returns the turn with its proposals', async () => {
    const res = await POST(
      request({ turnId, answer: '서윤은 열일곱 살 검객이다.' }),
      context({ workId }),
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toMatchObject({
      ok: true,
      data: {
        turn: { id: turnId, answer: '서윤은 열일곱 살 검객이다.' },
        proposals: expect.any(Array),
      },
    })
  })

  it('returns NOT_FOUND for a turn of another work', async () => {
    const res = await POST(request({ turnId: otherTurnId, answer: '답' }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('returns NOT_FOUND for a user who is not a member', async () => {
    const stranger = await createTestUser(state.db as Db, { email: 'stranger@example.com' })
    state.user = { id: stranger.id, name: stranger.name, email: stranger.email }
    const res = await POST(request({ turnId, answer: '답' }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('returns VALIDATION for an answer over 5000 characters', async () => {
    const res = await POST(request({ turnId, answer: '가'.repeat(5001) }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })
})
