import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { aiRuns, aiUsageEvents, authorDirectives, changeLog } from '@/db/schema'
import type { UsageEventKind } from '@/db/types'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { decideInferred, inferDirectives, listInferredProposals } from './directive-infer'

// Task 2: inference runs only for a done chapter from a draft with enough edits, and each
// proposal is decided once by the author.

const AI_TEXT = [
  '서윤은 문을 열었다.',
  '입꼬리가 올라갔다.',
  '안개가 방 안으로 들어왔다.',
  '그녀는 편지를 집어 들었다.',
  '창밖에서는 빗소리가 났다.',
  '밤이 깊었고 거리는 조용했다.',
].join(' ')
const SAVED_BODY = AI_TEXT.replace('입꼬리가 올라갔다.', '그녀는 작게 웃었다.')
const FAR_SENTENCE = '밤이 깊었고 거리는 조용했다.'

const PROPOSALS = [
  {
    text: `'입꼬리가 올라갔다'는 쓰지 않는다`,
    kind: 'ban',
    entryName: null,
    pattern: '입꼬리가 올라갔다',
    evidence: [1],
  },
  {
    text: '세린은 반말을 쓴다',
    kind: 'speech',
    entryName: '세린',
    pattern: null,
    evidence: [1],
  },
] as const

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  const entry = await createTestEntry(db, work.id, { name: '세린' })
  return { db, actor: { userId: owner.id }, workId: work.id, owner, entry }
}

type Setup = Awaited<ReturnType<typeof setup>>

async function plantDraftChapter(
  s: Setup,
  o: { body?: string; status?: 'draft' | 'done'; ratio?: number; withDraftUsed?: boolean } = {},
) {
  const chapter = await createTestChapter(s.db, s.workId, {
    body: o.body ?? SAVED_BODY,
    status: o.status ?? 'done',
  })
  let runId: string | null = null
  if (o.withDraftUsed ?? true) {
    const [run] = await s.db
      .insert(aiRuns)
      .values({
        workId: s.workId,
        userId: s.actor.userId,
        task: 'draft-chapter',
        status: 'done',
        output: { text: AI_TEXT },
      })
      .returning()
    runId = run.id
    await s.db.insert(aiUsageEvents).values({
      workId: s.workId,
      userId: s.actor.userId,
      chapterId: chapter.id,
      runId,
      kind: 'draft_used',
      value: AI_TEXT.length,
      extra: { mode: 1, priorChars: 0 },
    })
  }
  if (o.ratio !== undefined) {
    await s.db.insert(aiUsageEvents).values({
      workId: s.workId,
      userId: s.actor.userId,
      chapterId: chapter.id,
      runId,
      kind: 'draft_edit_ratio',
      value: o.ratio,
      extra: { aiChars: AI_TEXT.length, bodyChars: (o.body ?? SAVED_BODY).length },
    })
  }
  return { chapter, runId }
}

function inferClient(seen: { input?: unknown }) {
  return new FakeAiClient({
    overrides: {
      'directive-infer': (input: unknown) => {
        seen.input = input
        return { proposals: [...PROPOSALS] }
      },
    },
  })
}

async function inferRunCount(db: Db, workId: string) {
  return db
    .select()
    .from(aiRuns)
    .where(and(eq(aiRuns.workId, workId), eq(aiRuns.task, 'directive-infer')))
}

async function usageRows(db: Db, kind: UsageEventKind) {
  return db.select().from(aiUsageEvents).where(eq(aiUsageEvents.kind, kind))
}

describe('directive inference (stage 4, task 2)', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
  })

  it('infers proposals once for a done chapter from a draft with ratio 0.2', async () => {
    const { chapter } = await plantDraftChapter(s, { ratio: 0.2 })
    const seen: { input?: unknown } = {}
    const client = inferClient(seen)

    const result = await inferDirectives(
      s.db,
      s.actor,
      { workId: s.workId, chapterId: chapter.id },
      client,
    )

    expect(result.runId).toEqual(expect.any(String))
    expect(result.proposals).toHaveLength(2)
    expect(result.proposals[0]).toMatchObject({ text: PROPOSALS[0].text, entryId: null })
    expect(result.proposals[1]).toMatchObject({
      text: PROPOSALS[1].text,
      entryName: '세린',
      entryId: s.entry.id,
    })
    const calls = client.recorded.filter((call) => call.name === 'directive-infer')
    expect(calls).toHaveLength(1)
    // The prompt holds hunks only, never the full chapter.
    expect(calls[0].prompt).toContain('[수정 1]')
    expect(calls[0].prompt).toContain('전:')
    expect(calls[0].prompt).toContain('후:')
    expect(calls[0].prompt).toContain('입꼬리가 올라갔다')
    expect(calls[0].prompt).not.toContain(FAR_SENTENCE)
    const inferred = await usageRows(s.db, 'directive_inferred')
    expect(inferred).toHaveLength(1)
    expect(inferred[0].value).toBe(2)
  })

  it('returns the same run without a new call when the chapter is marked done again', async () => {
    const { chapter } = await plantDraftChapter(s, { ratio: 0.2 })
    const first = await inferDirectives(
      s.db,
      s.actor,
      { workId: s.workId, chapterId: chapter.id },
      inferClient({}),
    )
    const before = await inferRunCount(s.db, s.workId)

    const secondClient = inferClient({})
    const second = await inferDirectives(
      s.db,
      s.actor,
      { workId: s.workId, chapterId: chapter.id },
      secondClient,
    )

    expect(second.runId).toBe(first.runId)
    expect(second.proposals).toEqual(first.proposals)
    expect(secondClient.recorded.filter((call) => call.name === 'directive-infer')).toHaveLength(0)
    expect(await inferRunCount(s.db, s.workId)).toHaveLength(before.length)
  })

  it('runs no inference for a low ratio, a draft chapter, or a chapter without a draft', async () => {
    const low = await plantDraftChapter(s, { ratio: 0.03 })
    const draft = await plantDraftChapter(s, { status: 'draft', ratio: 0.2 })
    const noDraft = await plantDraftChapter(s, { ratio: 0.2, withDraftUsed: false })

    for (const { chapter } of [low, draft, noDraft]) {
      const client = inferClient({})
      const result = await inferDirectives(
        s.db,
        s.actor,
        { workId: s.workId, chapterId: chapter.id },
        client,
      )
      expect(result).toEqual({ runId: null, proposals: [] })
      expect(client.recorded.filter((call) => call.name === 'directive-infer')).toHaveLength(0)
    }
    expect(await inferRunCount(s.db, s.workId)).toHaveLength(0)
    expect(await usageRows(s.db, 'directive_inferred')).toHaveLength(0)
  })

  it('adds and ignores proposals, and rejects a second decision', async () => {
    const { chapter } = await plantDraftChapter(s, { ratio: 0.2 })
    const { runId } = await inferDirectives(
      s.db,
      s.actor,
      { workId: s.workId, chapterId: chapter.id },
      inferClient({}),
    )
    expect(runId).toEqual(expect.any(String))

    const added = await decideInferred(s.db, s.actor, {
      workId: s.workId,
      runId: runId as string,
      index: 1,
      decision: 'add',
    })
    expect(added.decision).toBe('added')
    const rows = await s.db
      .select()
      .from(authorDirectives)
      .where(eq(authorDirectives.workId, s.workId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      source: 'inferred',
      scope: 'character',
      entryId: s.entry.id,
      text: PROPOSALS[1].text,
    })
    const changes = await s.db.select().from(changeLog).where(eq(changeLog.targetId, rows[0].id))
    expect(changes).toHaveLength(1)
    const addedEvents = await usageRows(s.db, 'directive_inferred_added')
    expect(addedEvents).toHaveLength(1)

    const before = await s.db.select().from(authorDirectives)
    await decideInferred(s.db, s.actor, {
      workId: s.workId,
      runId: runId as string,
      index: 0,
      decision: 'ignore',
    })
    expect(await s.db.select().from(authorDirectives)).toEqual(before)
    expect(await listInferredProposals(s.db, s.actor, s.workId)).toEqual([])

    await expect(
      decideInferred(s.db, s.actor, {
        workId: s.workId,
        runId: runId as string,
        index: 0,
        decision: 'ignore',
      }),
    ).rejects.toMatchObject({ code: 'BAD_STATE', message: '이미 정한 제안입니다.' })
  })

  it('gives a non-member NOT_FOUND', async () => {
    const { chapter } = await plantDraftChapter(s, { ratio: 0.2 })
    const outsider = await createTestUser(s.db)
    const stranger = { userId: outsider.id }

    await expect(
      inferDirectives(s.db, stranger, { workId: s.workId, chapterId: chapter.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(listInferredProposals(s.db, stranger, s.workId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      decideInferred(s.db, stranger, {
        workId: s.workId,
        runId: chapter.id,
        index: 0,
        decision: 'ignore',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lets a viewer list undecided proposals, newest first, at most 10', async () => {
    const { chapter } = await plantDraftChapter(s, { ratio: 0.2 })
    const { runId } = await inferDirectives(
      s.db,
      s.actor,
      { workId: s.workId, chapterId: chapter.id },
      inferClient({}),
    )
    const viewer = await createTestUser(s.db)
    await addTestMember(s.db, s.workId, viewer.id, 'viewer')

    const proposals = await listInferredProposals(s.db, { userId: viewer.id }, s.workId)
    expect(proposals).toHaveLength(2)
    expect(proposals[0]).toMatchObject({ runId, index: 0 })
    expect(proposals[1]).toMatchObject({ runId, index: 1 })
  })
})
