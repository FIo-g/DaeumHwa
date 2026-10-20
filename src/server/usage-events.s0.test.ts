import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import type { UsageEventKind } from '@/db/types'
import { aiRuns, aiUsageEvents } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { recordDraftUse, recordUsageEvent, updateDraftEditRatio } from '@/server/usage-events'

// Stage 0 usage events: numbers only. The tests check counts and ratios, never text.

const AI_TEXT = '세린은 문을 열었다. 안개가 들어왔다.'
const EDITED_BODY = '세린은 문을 활짝 열었다. 안개가 들어왔다.'

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  const chapter = await createTestChapter(db, work.id, { body: EDITED_BODY })
  return { db, actor: { userId: owner.id }, workId: work.id, chapterId: chapter.id, owner }
}

async function insertDraftRun(db: Db, userId: string, workId: string, text: string) {
  const [run] = await db
    .insert(aiRuns)
    .values({ workId, userId, task: 'draft-chapter', status: 'done', output: { text } })
    .returning()
  return run.id
}

async function rowsOf(db: Db, kind: UsageEventKind) {
  return db.select().from(aiUsageEvents).where(eq(aiUsageEvents.kind, kind))
}

describe('usage events (stage 0)', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string
  let chapterId: string

  beforeEach(async () => {
    ;({ db, actor, workId, chapterId } = await setup())
  })

  it('records an event for a member', async () => {
    await recordUsageEvent(db, actor, {
      workId,
      kind: 'draft_started',
      value: 5,
      extra: { targetChars: 5500 },
    })
    const rows = await rowsOf(db, 'draft_started')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ workId, value: 5, extra: { targetChars: 5500 } })
  })

  it('gives a non-member NOT_FOUND', async () => {
    const outsider = await createTestUser(db, { email: 'outsider@example.com' })
    await expect(
      recordUsageEvent(db, { userId: outsider.id }, { workId, kind: 'draft_started', value: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await rowsOf(db, 'draft_started')).toHaveLength(0)
  })

  it('rejects a chapter of another work with NOT_FOUND and writes no event', async () => {
    const other = await createTestUser(db, { name: '다른 작가', email: 'other@example.com' })
    const otherWork = await createTestWork(db, other.id, { title: '다른 작품' })
    const otherChapter = await createTestChapter(db, otherWork.id, { body: EDITED_BODY })
    const runId = await insertDraftRun(db, actor.userId, workId, AI_TEXT)

    await expect(
      recordDraftUse(db, actor, { workId, chapterId: otherChapter.id, runId, priorChars: 0 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      recordUsageEvent(db, actor, {
        workId,
        chapterId: otherChapter.id,
        kind: 'draft_started',
        value: 1,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await db.select().from(aiUsageEvents)).toHaveLength(0)
  })

  it('rejects a chapter id that does not exist with NOT_FOUND, not a database error', async () => {
    const runId = await insertDraftRun(db, actor.userId, workId, AI_TEXT)

    await expect(
      recordDraftUse(db, actor, {
        workId,
        chapterId: '00000000-0000-4000-8000-000000000001',
        runId,
        priorChars: 0,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await db.select().from(aiUsageEvents)).toHaveLength(0)
  })

  it('rejects extra fields that are not numbers', async () => {
    await expect(
      recordUsageEvent(db, actor, {
        workId,
        kind: 'draft_started',
        value: 1,
        extra: { note: 'x' } as unknown as Record<string, number>,
      }),
    ).rejects.toThrow()
    expect(await rowsOf(db, 'draft_started')).toHaveLength(0)
  })

  it('writes one edit ratio row and updates it on the next call', async () => {
    const runId = await insertDraftRun(db, actor.userId, workId, AI_TEXT)
    await recordDraftUse(db, actor, { workId, chapterId, runId, priorChars: 0 })

    await updateDraftEditRatio(db, workId, chapterId, EDITED_BODY)
    const first = await rowsOf(db, 'draft_edit_ratio')
    expect(first).toHaveLength(1)
    expect(first[0].value).toBeGreaterThan(0)
    expect(first[0].value).toBeLessThan(1)

    await updateDraftEditRatio(db, workId, chapterId, AI_TEXT)
    const second = await rowsOf(db, 'draft_edit_ratio')
    expect(second).toHaveLength(1)
    expect(second[0].id).toBe(first[0].id)
    expect(second[0].value).toBe(0)
  })

  it('writes no edit ratio when the draft was appended to existing text', async () => {
    const runId = await insertDraftRun(db, actor.userId, workId, AI_TEXT)
    await recordDraftUse(db, actor, { workId, chapterId, runId, priorChars: 5 })

    await updateDraftEditRatio(db, workId, chapterId, EDITED_BODY)
    expect(await rowsOf(db, 'draft_edit_ratio')).toHaveLength(0)
  })

  it('writes nothing when the run is missing', async () => {
    await recordDraftUse(db, actor, {
      workId,
      chapterId,
      runId: '00000000-0000-4000-8000-000000000000',
      priorChars: 0,
    })
    await updateDraftEditRatio(db, workId, chapterId, EDITED_BODY)
    expect(await rowsOf(db, 'draft_used')).toHaveLength(0)
    expect(await rowsOf(db, 'draft_edit_ratio')).toHaveLength(0)
  })

  it.each([
    ['null', null],
    ['an empty object', {}],
  ])('writes no edit ratio when the run output is %s', async (_label, output) => {
    const [run] = await db
      .insert(aiRuns)
      .values({ workId, userId: actor.userId, task: 'draft-chapter', status: 'done', output })
      .returning()
    await recordUsageEvent(db, actor, {
      workId,
      chapterId,
      runId: run.id,
      kind: 'draft_used',
      value: 0,
      extra: { mode: 0, priorChars: 0 },
    })

    await expect(updateDraftEditRatio(db, workId, chapterId, EDITED_BODY)).resolves.toBeUndefined()
    expect(await rowsOf(db, 'draft_edit_ratio')).toHaveLength(0)
  })

  it('ignores a draft_used event of another work and writes no edit ratio', async () => {
    const other = await createTestUser(db, { name: '다른 작가', email: 'other@example.com' })
    const otherWork = await createTestWork(db, other.id, { title: '다른 작품' })
    const runId = await insertDraftRun(db, other.id, otherWork.id, AI_TEXT)
    await db.insert(aiUsageEvents).values({
      workId: otherWork.id,
      userId: other.id,
      chapterId,
      runId,
      kind: 'draft_used',
      value: AI_TEXT.length,
      extra: { mode: 1, priorChars: 0 },
    })

    await updateDraftEditRatio(db, workId, chapterId, EDITED_BODY)
    expect(await rowsOf(db, 'draft_edit_ratio')).toHaveLength(0)
  })

  it('skips an AI text over 40,000 characters', async () => {
    const runId = await insertDraftRun(db, actor.userId, workId, '가'.repeat(40001))
    await recordDraftUse(db, actor, { workId, chapterId, runId, priorChars: 0 })

    await expect(updateDraftEditRatio(db, workId, chapterId, EDITED_BODY)).resolves.toBeUndefined()
    expect(await rowsOf(db, 'draft_edit_ratio')).toHaveLength(0)
  })

  it('skips a body over 40,000 characters', async () => {
    const runId = await insertDraftRun(db, actor.userId, workId, AI_TEXT)
    await recordDraftUse(db, actor, { workId, chapterId, runId, priorChars: 0 })

    await expect(
      updateDraftEditRatio(db, workId, chapterId, '가'.repeat(40001)),
    ).resolves.toBeUndefined()
    expect(await rowsOf(db, 'draft_edit_ratio')).toHaveLength(0)
  })
})
