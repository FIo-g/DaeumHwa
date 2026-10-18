import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { setAiClientForTests } from '@/ai'
import { AppError } from '@/lib/errors'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'

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
  return new Request('http://localhost/api/works/x/style-suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const DIALOGUE = [
  '서윤이 고개를 저었다. "그건 아니야."',
  '서윤은 웃었다. "다시 말해 봐."',
  '서윤이 말했다. "알겠어요."',
].join('\n')

describe('POST /api/works/[workId]/style-suggest', () => {
  let workId: string
  let entryId: string
  let otherEntryId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    await createTestChapter(db, work.id, { position: 1, body: DIALOGUE })
    entryId = (await createTestEntry(db, work.id, { name: '서윤', kind: 'character' })).id
    const otherWork = await createTestWork(db, owner.id, { title: '다른 작품' })
    otherEntryId = (await createTestEntry(db, otherWork.id, { name: '서윤', kind: 'character' })).id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
    setAiClientForTests(new FakeAiClient())
  })

  function context(path: { workId: string }) {
    return { params: Promise.resolve(path) }
  }

  it('returns an UNAUTHENTICATED result when signed out', async () => {
    state.user = null
    const res = await POST(request({ entryId }), context({ workId }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })

  it('stores a pending style card proposal for an editor', async () => {
    const res = await POST(request({ entryId }), context({ workId }))
    expect(await res.json()).toMatchObject({
      ok: true,
      data: { type: 'style_card', status: 'pending' },
    })
  })

  it('rejects a body without a valid entry id', async () => {
    const res = await POST(request({ entryId: 'not-a-uuid' }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('returns NOT_FOUND when the entry belongs to another work', async () => {
    const res = await POST(request({ entryId: otherEntryId }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('returns NOT_FOUND for a user who is not a member', async () => {
    const stranger = await createTestUser(state.db as Db, { email: 'stranger@example.com' })
    state.user = { id: stranger.id, name: stranger.name, email: stranger.email }
    const res = await POST(request({ entryId }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('returns FORBIDDEN for a viewer', async () => {
    const viewer = await createTestUser(state.db as Db, { email: 'viewer@example.com' })
    await addTestMember(state.db as Db, workId, viewer.id, 'viewer')
    state.user = { id: viewer.id, name: viewer.name, email: viewer.email }
    const res = await POST(request({ entryId }), context({ workId }))
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
