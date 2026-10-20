import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { aiUsageEvents } from '@/db/schema'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { createChapterFromDraft, startDraft } from '@/server/ai-features'

// Stage 0: a draft start and a draft use are counted as numbers only.

const DRAFT = '서윤은 편지를 펼쳤다. 종이는 눅눅했다.'

describe('draft usage events (stage 0)', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    db = await createTestDb()
    const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
    const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
    actor = { userId: owner.id }
    workId = work.id
  })

  it('records draft_started with the instruction length and target', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: '종이 떤다', targetChars: 5500, entryIds: [] },
      client,
    )
    await run.done

    const rows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.kind, 'draft_started'))
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe(5)
    expect(rows[0].extra).toEqual({ targetChars: 5500 })
  })

  it('records draft_used for a chapter created from a draft', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: '종이 떤다', targetChars: 5500, entryIds: [] },
      client,
    )
    await run.done
    const chapter = await createChapterFromDraft(db, actor, { workId, runId: run.runId })

    const rows = await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.kind, 'draft_used'))
    expect(rows).toHaveLength(1)
    expect(rows[0].chapterId).toBe(chapter.id)
    expect(rows[0].runId).toBe(run.runId)
    expect(rows[0].extra).toEqual({ mode: 0, priorChars: 0 })
  })
})
