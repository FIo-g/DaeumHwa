import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { aiRuns, aiUsageEvents, authorDirectives } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { decideInferred, inferDirectives } from './directive-infer'

// Task 2 review: a proposal is decided with one conditional update, so two concurrent add calls
// can never write two ledger rows.

const AI_TEXT = [
  '서윤은 문을 열었다.',
  '입꼬리가 올라갔다.',
  '안개가 방 안으로 들어왔다.',
  '밤이 깊었고 거리는 조용했다.',
].join(' ')
const SAVED_BODY = AI_TEXT.replace('입꼬리가 올라갔다.', '그녀는 작게 웃었다.')

const PROPOSAL = {
  text: `'입꼬리가 올라갔다'는 쓰지 않는다`,
  kind: 'ban',
  entryName: null,
  pattern: '입꼬리가 올라갔다',
  evidence: [1],
} as const

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

describe('decideInferred concurrency (s4)', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
  })

  it('lets exactly one of two concurrent add decisions win', async () => {
    const inferred = await inferDirectives(
      s.db,
      s.actor,
      { workId: s.workId, chapterId: s.chapterId },
      new FakeAiClient({
        overrides: { 'directive-infer': () => ({ proposals: [PROPOSAL] }) },
      }),
    )
    expect(inferred.runId).toEqual(expect.any(String))

    const results = await Promise.allSettled([
      decideInferred(s.db, s.actor, {
        workId: s.workId,
        runId: inferred.runId as string,
        index: 0,
        decision: 'add',
      }),
      decideInferred(s.db, s.actor, {
        workId: s.workId,
        runId: inferred.runId as string,
        index: 0,
        decision: 'add',
      }),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatchObject({
      code: 'BAD_STATE',
      message: '이미 정한 제안입니다.',
    })

    const rows = await s.db
      .select()
      .from(authorDirectives)
      .where(and(eq(authorDirectives.workId, s.workId), eq(authorDirectives.source, 'inferred')))
    expect(rows).toHaveLength(1)
  })
})
