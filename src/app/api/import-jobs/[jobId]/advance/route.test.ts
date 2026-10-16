import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/ai/fake'
import { setAiClientForTests } from '@/ai'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as { id: string; name: string; email: string } | null,
}))

vi.mock('@/server/session', () => ({
  getSessionUser: async () => state.user,
}))

vi.mock('@/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/client')>()),
  getDb: () => state.db as Db,
}))

vi.mock('@/inngest/client', () => ({
  inngest: { send: async () => ({ ids: [] }) },
  isInngestEnabled: () => false,
}))

const { POST } = await import('./route')
const { createImportJob, appendImportChapters, startImportJob } = await import('@/server/imports')

function context(jobId: string) {
  return { params: Promise.resolve({ jobId }) }
}

describe('POST /api/import-jobs/[jobId]/advance', () => {
  let db: Db
  let workId: string
  let jobId: string

  beforeEach(async () => {
    db = await createTestDb()
    state.db = db
    setAiClientForTests(new FakeAiClient())
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    const actor = { userId: owner.id }
    const job = await createImportJob(db, actor, {
      workId: work.id,
      fileName: 'novel.txt',
      totalChapters: 1,
    })
    await appendImportChapters(db, actor, {
      jobId: job.id,
      chapters: [{ title: '1화', body: '서윤은 말이 없었다.' }],
    })
    await startImportJob(db, actor, job.id)
    jobId = job.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
  })

  it('returns 401 JSON when signed out', async () => {
    state.user = null
    const res = await POST(new Request('http://localhost/x', { method: 'POST' }), context(jobId))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
  })

  it('returns 404 JSON for a job of a work the user is not a member of', async () => {
    const stranger = await createTestUser(db)
    state.user = { id: stranger.id, name: stranger.name, email: stranger.email }
    const res = await POST(new Request('http://localhost/x', { method: 'POST' }), context(jobId))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: '작품을 찾을 수 없습니다.' })
  })

  it('returns 403 JSON for a viewer', async () => {
    const viewer = await createTestUser(db)
    await addTestMember(db, workId, viewer.id, 'viewer')
    state.user = { id: viewer.id, name: viewer.name, email: viewer.email }
    const res = await POST(new Request('http://localhost/x', { method: 'POST' }), context(jobId))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: '이 작업을 할 권한이 없습니다.' })
  })

  it('advances one chapter for an editor and returns the job status', async () => {
    const res = await POST(new Request('http://localhost/x', { method: 'POST' }), context(jobId))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toMatchObject({
      status: 'done',
      processed: 1,
      total: 1,
      done: true,
      message: null,
    })
  })
})
