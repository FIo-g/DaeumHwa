import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { setAiClientForTests } from '@/ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { withSceneTargets } from '@/lib/draft-plan'

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

const { POST } = await import('@/app/api/works/[workId]/draft/route')

function request(body: unknown): Request {
  return new Request('http://localhost/api/works/x/draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function context(workId: string) {
  return { params: Promise.resolve({ workId }) }
}

describe('POST /api/works/[workId]/draft with a plan card', () => {
  beforeEach(() => {
    // These tests check the append continuation, which is the `continue` length mode.
    vi.stubEnv('AI_DRAFT_LENGTH_MODE', 'continue')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  let workId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
    setAiClientForTests(new FakeAiClient())
  })

  it('returns 400 JSON for a card with no scenes', async () => {
    const card = { ...withSceneTargets(fakeDraftPlan(), 5000), scenes: [] }
    const res = await POST(
      request({ instructions: '', entryIds: [], targetChars: 5000, plan: card }),
      context(workId),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '입력값이 올바르지 않습니다.' })
  })

  it('returns 400 JSON for a card with a summary over 400 characters', async () => {
    const card = withSceneTargets(fakeDraftPlan(), 5000)
    card.scenes[0] = { ...card.scenes[0], summary: '가'.repeat(401) }
    const res = await POST(
      request({ instructions: '', entryIds: [], targetChars: 5000, plan: card }),
      context(workId),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '입력값이 올바르지 않습니다.' })
  })

  it('starts a draft from a valid card and stores the plan in the run', async () => {
    const card = withSceneTargets(fakeDraftPlan(), 5000)
    const planRunId = crypto.randomUUID()
    const res = await POST(
      request({
        instructions: '',
        entryIds: [],
        targetChars: 5000,
        plan: card,
        planRunId,
        planEdits: { revisions: 0, removed: 0, moved: 0, textEdits: 0 },
      }),
      context(workId),
    )
    expect(res.status).toBe(200)
    const runId = res.headers.get('x-run-id') ?? ''
    const text = await res.text()

    const [row] = await (state.db as Db).select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.output).toEqual({ text, plan: card, planRunId, instructions: null, planNotes: [] })
  })
})
