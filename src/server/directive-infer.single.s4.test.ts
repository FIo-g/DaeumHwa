import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { aiRuns, aiUsageEvents } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { inferDirectives } from './directive-infer'

// Task 2/3 review: a second inference for a chapter already running makes no AI call.

const AI_TEXT = '서윤은 문을 열었다. 입꼬리가 올라갔다. 밤이 깊었다.'
const SAVED_BODY = AI_TEXT.replace('입꼬리가 올라갔다.', '그녀는 작게 웃었다.')

type Setup = {
  db: Db
  actor: { userId: string }
  workId: string
  chapterId: string
}

async function setup(): Promise<Setup> {
  const db = await createTestDb()
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  const chapter = await createTestChapter(db, work.id, { body: SAVED_BODY, status: 'done' })
  const [draftRun] = await db
    .insert(aiRuns)
    .values({
      workId: work.id,
      userId: owner.id,
      task: 'draft-chapter',
      status: 'done',
      output: { text: AI_TEXT },
    })
    .returning()
  await db.insert(aiUsageEvents).values({
    workId: work.id,
    userId: owner.id,
    chapterId: chapter.id,
    runId: draftRun.id,
    kind: 'draft_used',
    value: AI_TEXT.length,
    extra: { mode: 1, priorChars: 0 },
  })
  await db.insert(aiUsageEvents).values({
    workId: work.id,
    userId: owner.id,
    chapterId: chapter.id,
    runId: draftRun.id,
    kind: 'draft_edit_ratio',
    value: 0.2,
    extra: { aiChars: AI_TEXT.length, bodyChars: SAVED_BODY.length },
  })
  return { db, actor: { userId: owner.id }, workId: work.id, chapterId: chapter.id }
}

describe('inferDirectives single flight (s4)', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
  })

  it('makes no AI call while a directive-infer run of the chapter is running', async () => {
    await s.db.insert(aiRuns).values({
      workId: s.workId,
      userId: s.actor.userId,
      chapterId: s.chapterId,
      task: 'directive-infer',
      status: 'running',
    })
    const client = new FakeAiClient({ overrides: { 'directive-infer': () => ({ proposals: [] }) } })

    const result = await inferDirectives(
      s.db,
      s.actor,
      { workId: s.workId, chapterId: s.chapterId },
      client,
    )

    expect(result).toEqual({ runId: null, proposals: [] })
    expect(client.recorded.filter((call) => call.name === 'directive-infer')).toHaveLength(0)
  })
})
