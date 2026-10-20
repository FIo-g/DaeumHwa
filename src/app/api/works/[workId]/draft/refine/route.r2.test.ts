import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { setAiClientForTests } from '@/ai'
import { AppError } from '@/lib/errors'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'

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

const { POST, maxDuration } = await import('./route')

const FIVE =
  '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다. 그녀는 숨을 죽였다.'

function request(body: unknown): Request {
  return new Request('http://localhost/api/works/x/draft/refine', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/works/[workId]/draft/refine', () => {
  let workId: string
  let runId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => `비가 내렸다.\n\n${FIVE}` },
    })
    setAiClientForTests(client)
    const run = await startDraft(
      db,
      { userId: owner.id },
      { workId, instructions: '서윤이 편지를 발견한다.', targetChars: 10, entryIds: [] },
      client,
    )
    await run.done
    runId = run.runId
  })

  function context(path: { workId: string }) {
    return { params: Promise.resolve(path) }
  }

  it('returns UNAUTHENTICATED when signed out', async () => {
    state.user = null
    const res = await POST(request({ runId }), context({ workId }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })

  it('returns a preview for an editor', async () => {
    const res = await POST(request({ runId }), context({ workId }))
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toMatchObject({
      ok: true,
      data: { runId, changed: true, parts: expect.any(Array) },
    })
  })

  it('returns VALIDATION for a run id that is not a uuid', async () => {
    const res = await POST(request({ runId: 'not-a-uuid' }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('returns NOT_FOUND for a non-member and FORBIDDEN for a viewer', async () => {
    const stranger = await createTestUser(state.db as Db, { email: 'stranger@example.com' })
    state.user = { id: stranger.id, name: stranger.name, email: stranger.email }
    const asStranger = await POST(request({ runId }), context({ workId }))
    expect(await asStranger.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })

    const viewer = await createTestUser(state.db as Db, { email: 'viewer@example.com' })
    await addTestMember(state.db as Db, workId, viewer.id, 'viewer')
    state.user = { id: viewer.id, name: viewer.name, email: viewer.email }
    const asViewer = await POST(request({ runId }), context({ workId }))
    expect(await asViewer.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('declares the long-run route options', () => {
    expect(maxDuration).toBe(300)
  })
})
