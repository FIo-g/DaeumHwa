import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { DRAFT_REPLACE_MARK, parseDraftStream } from '@/lib/draft-stream'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'

describe('draft trailing plan label', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string
  const INSTRUCTIONS = '서윤이 편지를 발견한다.'

  beforeEach(async () => {
    db = await createTestDb()
    const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
    const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
    actor = { userId: owner.id }
    workId = work.id
  })

  async function readAll(stream: AsyncIterable<string>): Promise<string> {
    let text = ''
    for await (const chunk of stream) text += chunk
    return text
  }

  it('stores the draft without a trailing 회차 끝 and sends a replace record', async () => {
    const body = `${'가'.repeat(600)}\n\n회차 끝`
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => body },
    })
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 500, entryIds: [] },
      client,
    )
    const streamed = await readAll(textStream)
    const text = await done

    expect(text).toBe('가'.repeat(600))
    expect(streamed).toContain(DRAFT_REPLACE_MARK)
    expect(parseDraftStream(streamed).text).toBe(text)
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect((row.output as { text: string }).text).toBe(text)
  })
})
