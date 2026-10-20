import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { aiRuns, aiUsageEvents } from '@/db/schema'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
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

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function draftStartedRows() {
    return db.select().from(aiUsageEvents).where(eq(aiUsageEvents.kind, 'draft_started'))
  }

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
    expect(rows[0].runId).toBe(run.runId)
    expect(rows[0].chapterId).toBeNull()
  })

  it('records the resolved chapter id for a draft of an existing chapter', async () => {
    const chapter = await createTestChapter(db, workId, { body: '' })
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const run = await startDraft(
      db,
      actor,
      { workId, chapterId: chapter.id, instructions: '종이 떤다', entryIds: [] },
      client,
    )
    await run.done

    const rows = await draftStartedRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ chapterId: chapter.id, runId: run.runId })
  })

  it('records no draft_started when the chapter belongs to another work', async () => {
    const other = await createTestUser(db, { name: '다른 작가', email: 'other@example.com' })
    const otherWork = await createTestWork(db, other.id, { title: '다른 작품' })
    const otherChapter = await createTestChapter(db, otherWork.id, { body: '' })
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })

    await expect(
      startDraft(
        db,
        actor,
        { workId, chapterId: otherChapter.id, instructions: '종이 떤다', entryIds: [] },
        client,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await draftStartedRows()).toHaveLength(0)
  })

  it('records no draft_started when the user already has three runs going', async () => {
    await db.insert(aiRuns).values(
      [1, 2, 3].map(() => ({
        workId,
        userId: actor.userId,
        task: 'draft-chapter' as const,
        status: 'running' as const,
      })),
    )
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })

    await expect(
      startDraft(db, actor, { workId, instructions: '종이 떤다', entryIds: [] }, client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await draftStartedRows()).toHaveLength(0)
  })

  it('records no draft_started when the daily limit is reached', async () => {
    vi.stubEnv('AI_DAILY_TOKEN_LIMIT', '1')
    await db.insert(aiRuns).values({
      workId,
      userId: actor.userId,
      task: 'draft-chapter',
      status: 'done',
      inputTokens: 10,
      outputTokens: 10,
    })
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })

    await expect(
      startDraft(db, actor, { workId, instructions: '종이 떤다', entryIds: [] }, client),
    ).rejects.toMatchObject({ code: 'AI_LIMIT' })
    expect(await draftStartedRows()).toHaveLength(0)
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
