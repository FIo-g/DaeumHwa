import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { aiRuns, aiUsageEvents } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { createChapterFromDraft } from '@/server/ai-features'
import { saveChapter } from '@/server/chapters'
import { updateDraftEditRatio } from '@/server/usage-events'

// Stage 0: a save never fails because usage counting fails.

vi.mock('@/server/usage-events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/usage-events')>()
  return { ...actual, updateDraftEditRatio: vi.fn(actual.updateDraftEditRatio) }
})

const AI_TEXT = '세린은 문을 열었다. 안개가 들어왔다.'
const EDITED = '세린은 문을 활짝 열었다. 안개가 들어왔다.'

describe('saveChapter usage counting (stage 0)', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    vi.mocked(updateDraftEditRatio).mockClear()
    db = await createTestDb()
    const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
    const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
    actor = { userId: owner.id }
    workId = work.id
  })

  it('saves the body when the ratio update throws', async () => {
    const chapter = await createTestChapter(db, workId, { body: '처음 원고' })
    vi.mocked(updateDraftEditRatio).mockRejectedValueOnce(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const saved = await saveChapter(db, actor, {
      chapterId: chapter.id,
      body: EDITED,
      expectedVersion: chapter.version,
    })
    expect(saved.body).toBe(EDITED)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('updates the ratio row after a normal save of a chapter created from a draft', async () => {
    const [run] = await db
      .insert(aiRuns)
      .values({
        workId,
        userId: actor.userId,
        task: 'draft-chapter',
        status: 'done',
        output: { text: AI_TEXT },
      })
      .returning()
    const created = await createChapterFromDraft(db, actor, { workId, runId: run.id })

    await saveChapter(db, actor, {
      chapterId: created.id,
      body: EDITED,
      expectedVersion: created.version,
    })

    const rows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.kind, 'draft_edit_ratio'))
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBeGreaterThan(0)
    expect(rows[0].value).toBeLessThan(1)
  })

  describe('with a draft_used event planted from another work', () => {
    const FOREIGN_TEXT = '다른 작품의 초안 문장이다. 이 글은 길이가 꽤 다르다. 아주 다르다.'

    async function setupTwoWorks() {
      const [run] = await db
        .insert(aiRuns)
        .values({
          workId,
          userId: actor.userId,
          task: 'draft-chapter',
          status: 'done',
          output: { text: AI_TEXT },
        })
        .returning()
      const created = await createChapterFromDraft(db, actor, { workId, runId: run.id })

      const attacker = await createTestUser(db, { name: '침입자', email: 'attacker@example.com' })
      const attackerWork = await createTestWork(db, attacker.id, { title: '다른 작품' })
      const [attackerRun] = await db
        .insert(aiRuns)
        .values({
          workId: attackerWork.id,
          userId: attacker.id,
          task: 'draft-chapter',
          status: 'done',
          output: { text: FOREIGN_TEXT },
        })
        .returning()
      const plant = () =>
        db.insert(aiUsageEvents).values({
          workId: attackerWork.id,
          userId: attacker.id,
          chapterId: created.id,
          runId: attackerRun.id,
          kind: 'draft_used',
          value: FOREIGN_TEXT.length,
          extra: { mode: 1, priorChars: 0 },
          createdAt: new Date(Date.now() + 60_000),
        })
      return { run, created, plant }
    }

    async function ratioRows() {
      return db.select().from(aiUsageEvents).where(eq(aiUsageEvents.kind, 'draft_edit_ratio'))
    }

    it('computes the ratio from the work own run', async () => {
      const { run, created, plant } = await setupTwoWorks()
      await plant()

      await saveChapter(db, actor, {
        chapterId: created.id,
        body: EDITED,
        expectedVersion: created.version,
      })

      const rows = await ratioRows()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ workId, userId: actor.userId, runId: run.id })
      expect(rows[0].extra).toMatchObject({ aiChars: AI_TEXT.length })
    })

    it('keeps the existing ratio row of the work', async () => {
      const { run, created, plant } = await setupTwoWorks()
      const first = await saveChapter(db, actor, {
        chapterId: created.id,
        body: EDITED,
        expectedVersion: created.version,
      })
      const before = await ratioRows()
      expect(before).toHaveLength(1)
      await plant()

      await saveChapter(db, actor, {
        chapterId: created.id,
        body: `${EDITED} 한 줄 더.`,
        expectedVersion: first.version,
      })

      const rows = await ratioRows()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: before[0].id, workId, runId: run.id })
      expect(rows[0].extra).toMatchObject({ aiChars: AI_TEXT.length })
    })
  })

  it('saves a chapter created from a draft over 40,000 characters and writes no ratio', async () => {
    const [run] = await db
      .insert(aiRuns)
      .values({
        workId,
        userId: actor.userId,
        task: 'draft-chapter',
        status: 'done',
        output: { text: '가'.repeat(40001) },
      })
      .returning()
    const created = await createChapterFromDraft(db, actor, { workId, runId: run.id })
    const newBody = '나'.repeat(40001)

    const saved = await saveChapter(db, actor, {
      chapterId: created.id,
      body: newBody,
      expectedVersion: created.version,
    })

    expect(saved.body).toBe(newBody)
    const rows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.kind, 'draft_edit_ratio'))
    expect(rows).toHaveLength(0)
  })
})
