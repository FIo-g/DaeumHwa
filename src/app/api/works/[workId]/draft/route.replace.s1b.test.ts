import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { setAiClientForTests } from '@/ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { DRAFT_REPLACE_MARK, draftReplaceRecord, parseDraftStream } from '@/lib/draft-stream'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'

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

const BREAK = '\n\n***\n\n'
// Each scene is about 1,000 characters, so with a 5,000 target and three scenes it is short of its share.
const SCENE_A = '서윤은 문을 열었다. 바람이 차가웠다. '.repeat(53).trim()
const SCENE_B = '민준은 편지를 읽었다. 종이가 젖어 있었다. '.repeat(53).trim()
const SCENE_C = '도윤은 창을 닫았다. 밖에서 비가 내렸다. '.repeat(53).trim()
const DRAFT = [SCENE_A, SCENE_B, SCENE_C].join(BREAK)

/** A longer span whose sentences are all different, so it passes acceptExpansion. */
function grown(label: string, count = 60): string {
  return Array.from(
    { length: count },
    (_, i) => `${label}의 장면에서 ${i}번째 감각이 천천히 번졌다.`,
  ).join(' ')
}

/** The parser of the panel build before the replace record existed: everything before the error mark. */
function oldParse(raw: string): string {
  const at = raw.indexOf('\u001e')
  return at === -1 ? raw : raw.slice(0, at)
}

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

describe('POST /api/works/[workId]/draft and the replace record', () => {
  let workId: string
  let client: FakeAiClient

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
    let call = 0
    const expansions = [grown('가'), grown('나'), grown('다')]
    client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': () => expansions[call++],
      },
    })
    setAiClientForTests(client)
  })

  async function tasksRecorded(): Promise<string[]> {
    const rows = await (state.db as Db).select().from(aiRuns).where(eq(aiRuns.workId, workId))
    return rows.map((row) => row.task)
  }

  const BODY = { instructions: '서윤이 편지를 발견한다.', entryIds: [], targetChars: 5000 }

  it('sends no replace record and makes no expansion call without acceptsReplace', async () => {
    const res = await POST(request(BODY), context(workId))
    expect(res.status).toBe(200)
    const body = await res.text()

    expect(body).not.toContain(DRAFT_REPLACE_MARK)
    expect(oldParse(body)).toBe(DRAFT)
    expect(parseDraftStream(body)).toEqual({ text: DRAFT, error: null })
    expect(await tasksRecorded()).toEqual(['draft-chapter'])
    // The stored text is the shown text.
    const runId = res.headers.get('x-run-id') ?? ''
    const [row] = await (state.db as Db).select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.output).toEqual({ text: DRAFT })
  })

  it('sends no replace record when acceptsReplace is false', async () => {
    const res = await POST(request({ ...BODY, acceptsReplace: false }), context(workId))
    const body = await res.text()

    expect(body).toBe(DRAFT)
    expect(await tasksRecorded()).toEqual(['draft-chapter'])
  })

  it('ends the body with the replace record when acceptsReplace is true', async () => {
    const res = await POST(request({ ...BODY, acceptsReplace: true }), context(workId))
    expect(res.status).toBe(200)
    const body = await res.text()

    const runId = res.headers.get('x-run-id') ?? ''
    const [row] = await (state.db as Db).select().from(aiRuns).where(eq(aiRuns.id, runId))
    const spliced = (row.output as { text: string }).text
    expect(spliced).not.toBe(DRAFT)
    expect(body).toBe(DRAFT + draftReplaceRecord(spliced))
    expect(parseDraftStream(body).text).toBe(spliced)
    expect((await tasksRecorded()).filter((task) => task === 'draft-expand')).toHaveLength(3)
  })

  it('returns 400 for an acceptsReplace that is not a boolean', async () => {
    const res = await POST(request({ ...BODY, acceptsReplace: 'yes' }), context(workId))
    expect(res.status).toBe(400)
  })
})
