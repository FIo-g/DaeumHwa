import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { setAiClientForTests } from '@/ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { AppError } from '@/lib/errors'
import { DRAFT_ERROR_MARK, DRAFT_FAILED_MESSAGE, draftErrorRecord } from '@/lib/draft-stream'

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

describe('POST /api/works/[workId]/draft', () => {
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

  it('returns 401 JSON when signed out', async () => {
    state.user = null
    const res = await POST(
      request({ instructions: '서윤이 편지를 발견한다.', entryIds: [] }),
      context(workId),
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
  })

  it('returns 400 JSON for empty instructions', async () => {
    const res = await POST(request({ instructions: ' ', entryIds: [] }), context(workId))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '무슨 일이 일어나야 하는지 적어 주세요.' })
  })

  it('returns 404 JSON for a work the user is not a member of', async () => {
    const stranger = await createTestUser(state.db as Db, { email: 'stranger@example.com' })
    state.user = { id: stranger.id, name: stranger.name, email: stranger.email }
    const res = await POST(
      request({ instructions: '서윤이 편지를 발견한다.', entryIds: [] }),
      context(workId),
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: '작품을 찾을 수 없습니다.' })
  })

  it('streams plain text with the run id header', async () => {
    const res = await POST(
      request({ instructions: '서윤이 편지를 발견한다.', entryIds: [] }),
      context(workId),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('x-run-id')).toMatch(/^[0-9a-f-]{36}$/)
    const text = await res.text()
    expect(text.startsWith('(데모 초안) ')).toBe(true)
  })

  it('marks the run done before the body closes', async () => {
    // The final result settles after the text has streamed, like a real provider's usage report.
    class SlowFinalClient extends FakeAiClient {
      override streamText(args: Parameters<FakeAiClient['streamText']>[0]) {
        const stream = super.streamText(args)
        const final = stream.final.then(
          (result) =>
            new Promise<typeof result>((resolve) => setTimeout(() => resolve(result), 50)),
        )
        return { textStream: stream.textStream, final }
      }
    }
    setAiClientForTests(new SlowFinalClient())
    const res = await POST(
      request({ instructions: '서윤이 편지를 발견한다.', entryIds: [] }),
      context(workId),
    )
    const runId = res.headers.get('x-run-id') ?? ''
    await res.text()
    const [run] = await (state.db as Db)
      .select({ status: aiRuns.status })
      .from(aiRuns)
      .where(eq(aiRuns.id, runId))
    expect(run?.status).toBe('done')
  })

  it('appends the Korean error record after the text when the draft fails midway', async () => {
    const timeout = 'AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도해 주세요.'
    class FailingMidwayClient extends FakeAiClient {
      override streamText() {
        const final = Promise.reject(new AppError('AI_ERROR', timeout))
        final.catch(() => {})
        return {
          textStream: (async function* () {
            yield '앞부분 초안'
            throw new AppError('AI_ERROR', timeout)
          })(),
          final,
        }
      }
    }
    setAiClientForTests(new FailingMidwayClient())
    const res = await POST(
      request({ instructions: '서윤이 편지를 발견한다.', entryIds: [] }),
      context(workId),
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe(`앞부분 초안${draftErrorRecord(timeout)}`)
    expect(text.split(DRAFT_ERROR_MARK)).toHaveLength(2)
  })

  it('sends a generic Korean error record for an unexpected failure, not the raw message', async () => {
    class BrokenClient extends FakeAiClient {
      override streamText() {
        const final = Promise.reject(new Error('secret internal detail'))
        final.catch(() => {})
        return {
          textStream: (async function* () {
            yield '앞'
            throw new Error('secret internal detail')
          })(),
          final,
        }
      }
    }
    setAiClientForTests(new BrokenClient())
    const res = await POST(
      request({ instructions: '서윤이 편지를 발견한다.', entryIds: [] }),
      context(workId),
    )
    const text = await res.text()
    expect(text).toBe(`앞${draftErrorRecord(DRAFT_FAILED_MESSAGE)}`)
    expect(text).not.toContain('secret internal detail')
  })
})
