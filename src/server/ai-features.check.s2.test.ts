import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { aiRuns, aiUsageEvents } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestUser, createTestWork } from '@/test/factories'
import { createDirective } from '@/server/directives'
import { startDraft } from '@/server/ai-features'

// Stage 2 (task 5): the stored draft carries the request findings, and a failed check changes nothing.

const check = vi.hoisted(() => ({ fail: false }))

vi.mock('@/lib/directive-check', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/directive-check')>()
  return {
    ...actual,
    checkDraftDirectives: (...args: Parameters<typeof actual.checkDraftDirectives>) => {
      if (check.fail) throw new Error('check broke')
      return actual.checkDraftDirectives(...args)
    },
  }
})

// Two paragraphs with 입꼬리, long enough that no expansion runs at the 500 target.
const DRAFT = [
  '그녀는 웃음을 참으려고 입꼬리를 눌렀다. ' + '비가 그친 골목은 조용했다. '.repeat(20),
  '그가 다시 입꼬리를 올렸다. ' + '창문 너머로 바람이 불었다. '.repeat(20),
].join('\n')

let db: Db
let actor: { userId: string }
let workId: string

beforeEach(async () => {
  check.fail = false
  db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  actor = { userId: owner.id }
  workId = work.id
  await createDirective(db, actor, {
    workId,
    scope: 'work',
    kind: 'ban',
    text: "'입꼬리'라는 말은 쓰지 않는다.",
    pattern: '입꼬리',
    source: 'author',
  })
})

async function runDraft() {
  const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
  const { runId, done } = await startDraft(
    db,
    actor,
    { workId, instructions: '서윤이 골목을 걷는다.', targetChars: 500, entryIds: [] },
    client,
  )
  const text = await done
  return { runId, text }
}

describe('draft request findings (stage 2)', () => {
  it('stores directiveFindings and one directive_violation event', async () => {
    const { runId, text } = await runDraft()
    expect(text).toBe(DRAFT)
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
    const output = row.output as { text: string; directiveFindings: { count: number }[] }
    expect(output.text).toBe(DRAFT)
    expect(output.directiveFindings).toEqual([
      expect.objectContaining({ kind: 'ban', count: 2, paragraphs: [0, 1] }),
    ])
    const events = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.kind, 'directive_violation'))
    expect(events).toHaveLength(1)
    expect(events[0].value).toBe(2)
  })

  it('stores the draft as usual when the check throws', async () => {
    check.fail = true
    const { runId, text } = await runDraft()
    expect(text).toBe(DRAFT)
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
    expect(row.status).toBe('done')
    expect(row.output).toEqual({ text: DRAFT })
  })
})
