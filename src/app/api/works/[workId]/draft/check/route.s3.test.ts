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

const S1 = '민준은 문을 열고 들어섰다. 방 안은 조용했고 창문이 열려 있었다. 바람이 커튼을 흔들었다.'
const S2 =
  '지수는 창밖을 보았다. 거리에는 사람들이 오가고 있었다. 그녀는 편지를 꺼내어 읽었다. 마음이 흔들렸다.'
const S3 =
  '문이 닫혔다. 복도가 조용해졌다. 민준은 계단을 내려가며 발걸음을 늦추었다. 밤이 깊어졌다.'
const THREE = [S1, S2, S3].join('\n\n***\n\n')

function request(body: unknown): Request {
  return new Request('http://localhost/api/works/x/draft/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/works/[workId]/draft/check', () => {
  let workId: string
  let runId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    setAiClientForTests(null)
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => THREE,
        'draft-check': () => ({ scenes: [] }),
        'scene-fix': (input: unknown) => ({ text: (input as { scene: string }).scene }),
      },
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

  it('returns 200 with the check result', async () => {
    const res = await POST(request({ runId }), context({ workId }))

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, data: { findings: expect.any(Array) } })
  })

  it('maps a bad run to BAD_STATE like the refine route', async () => {
    const res = await POST(
      request({ runId: '00000000-0000-4000-8000-000000000000' }),
      context({ workId }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(['NOT_FOUND', 'BAD_STATE', 'FORBIDDEN'].includes(body.error.code)).toBe(true)
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
