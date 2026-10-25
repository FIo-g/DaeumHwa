import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeDraftRepair } from '@/test/ai-fakes/draft-repair'
import type { DraftRepairInput } from '@/ai/tasks/draft-repair'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import { createChapterFromDraft, repairDraftForeignScript, startDraft } from '@/server/ai-features'

// Track C: the foreign-script repair of a finished draft (spec 6, 7). Helpers copied from E2's test.

const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'
const HAN_TEXT = '첫 문장이다. 그는 三楼 에서 말했다. 끝 문장이다.'
const CLEAN_TEXT = '첫 문장이다. 그는 조용히 말했다. 끝 문장이다.'

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id }
}

/** Runs a draft whose text is `text`. targetChars is tiny so no continuation runs. */
async function draftOf(
  db: Db,
  actor: { userId: string },
  workId: string,
  text: string,
  overrides: Record<string, (input: unknown) => unknown> = {},
) {
  const client = new FakeAiClient({ overrides: { 'draft-chapter': () => text, ...overrides } })
  const run = await startDraft(
    db,
    actor,
    { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [] },
    client,
  )
  await run.done
  return { runId: run.runId, client }
}

async function outputOf(db: Db, runId: string): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
  return row.output as Record<string, unknown>
}

async function repairRows(db: Db, workId: string) {
  return db
    .select()
    .from(aiRuns)
    .where(and(eq(aiRuns.workId, workId), eq(aiRuns.task, 'draft-repair')))
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the call to reject')
}

describe('repairDraftForeignScript', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  it('replaces only the sentence with Han and keeps its neighbors', async () => {
    const { runId, client } = await draftOf(db, actor, workId, HAN_TEXT)
    const result = await repairDraftForeignScript(db, actor, { workId, runId }, client)

    expect(result.text).toBe('첫 문장이다. 그는 에서 말했다. 끝 문장이다.')
    expect(result.replaced).toBe(1)
    expect(result.unresolved).toEqual([])
  })

  it('stores the repaired text and keeps the raw draft in rawText', async () => {
    const { runId, client } = await draftOf(db, actor, workId, HAN_TEXT)
    const result = await repairDraftForeignScript(db, actor, { workId, runId }, client)

    expect(await outputOf(db, runId)).toEqual({
      text: result.text,
      rawText: HAN_TEXT,
      instructions: INSTRUCTIONS,
      planNotes: [],
    })
    const chapter = await createChapterFromDraft(db, actor, { workId, runId })
    expect(chapter.body).toBe(result.text)
  })

  it('makes no AI call and no write when the draft has no foreign script', async () => {
    const { runId } = await draftOf(db, actor, workId, CLEAN_TEXT)
    const client = new FakeAiClient({
      overrides: {
        'draft-repair': () => {
          throw new Error('no call expected')
        },
      },
    })
    const before = await outputOf(db, runId)
    const result = await repairDraftForeignScript(db, actor, { workId, runId }, client)

    expect(result).toEqual({ text: CLEAN_TEXT, replaced: 0, unresolved: [] })
    expect(await outputOf(db, runId)).toEqual(before)
    expect(await repairRows(db, workId)).toEqual([])
  })

  it('reports a sentence whose repair still has foreign script, after two rounds', async () => {
    const text = '첫 문장이다. 그는 嬷嬷 에서 말했다. 끝 문장이다.'
    let calls = 0
    const { runId, client } = await draftOf(db, actor, workId, text, {
      'draft-repair': () => {
        calls += 1
        return {
          edits: [{ quote: '그는 嬷嬷 에서 말했다.', replacement: '그는 嬷嬷에서 말했다.' }],
        }
      },
    })
    const result = await repairDraftForeignScript(db, actor, { workId, runId }, client)

    expect(calls).toBe(2)
    expect(result.text).toBe(text)
    expect(result.replaced).toBe(0)
    expect(result.unresolved.map((span) => span.text)).toEqual(['嬷嬷'])
    expect(await outputOf(db, runId)).toEqual({ text, instructions: INSTRUCTIONS, planNotes: [] })
  })

  it('fixes the rest of the sentences in a second round', async () => {
    const text = '첫 문장이다. 그는 三楼 에서 말했다. 그녀는 以上是 말했다. 끝 문장이다.'
    let calls = 0
    const { runId, client } = await draftOf(db, actor, workId, text, {
      'draft-repair': (input) => {
        calls += 1
        const { flags } = input as DraftRepairInput
        // Round 1 gets two flags and answers only the first; round 2 gets one and answers it.
        return fakeDraftRepair({
          text: (input as DraftRepairInput).text,
          flags: calls === 1 ? flags.slice(0, 1) : flags,
        })
      },
    })
    const result = await repairDraftForeignScript(db, actor, { workId, runId }, client)

    expect(result.unresolved).toEqual([])
    expect(result.replaced).toBe(2)
    expect(result.text).toBe('첫 문장이다. 그는 에서 말했다. 그녀는 말했다. 끝 문장이다.')
    expect(calls).toBe(2)
    expect(await repairRows(db, workId)).toHaveLength(2)
  })

  it('returns NOT_FOUND to a non-member', async () => {
    const { runId, client } = await draftOf(db, actor, workId, HAN_TEXT)
    const outsider = await createTestUser(db, { email: 'outsider@example.com' })
    const error = await captureError(
      repairDraftForeignScript(db, { userId: outsider.id }, { workId, runId }, client),
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns FORBIDDEN to a viewer', async () => {
    const { runId, client } = await draftOf(db, actor, workId, HAN_TEXT)
    const viewer = await createTestUser(db, { email: 'viewer@example.com' })
    await addTestMember(db, workId, viewer.id, 'viewer')
    const error = await captureError(
      repairDraftForeignScript(db, { userId: viewer.id }, { workId, runId }, client),
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects a run that is not done, and an unknown run', async () => {
    const [errorRun] = await db
      .insert(aiRuns)
      .values({
        workId,
        userId: actor.userId,
        task: 'draft-chapter',
        status: 'error',
        output: { text: HAN_TEXT },
      })
      .returning()
    const client = new FakeAiClient()
    const notDone = await captureError(
      repairDraftForeignScript(db, actor, { workId, runId: errorRun.id }, client),
    )
    expect(notDone).toMatchObject({ code: 'BAD_STATE' })

    const unknown = await captureError(
      repairDraftForeignScript(
        db,
        actor,
        { workId, runId: '00000000-0000-4000-8000-000000000000' },
        client,
      ),
    )
    expect(unknown).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns NOT_FOUND for a done run that is not a draft', async () => {
    const [otherRun] = await db
      .insert(aiRuns)
      .values({
        workId,
        userId: actor.userId,
        task: 'draft-repair',
        status: 'done',
        output: { text: HAN_TEXT },
      })
      .returning()
    const error = await captureError(
      repairDraftForeignScript(db, actor, { workId, runId: otherRun.id }, new FakeAiClient()),
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns NOT_FOUND to an editor who does not own the run', async () => {
    const { runId, client } = await draftOf(db, actor, workId, HAN_TEXT)
    const editor = await createTestUser(db, { email: 'editor@example.com' })
    await addTestMember(db, workId, editor.id, 'editor')
    const error = await captureError(
      repairDraftForeignScript(db, { userId: editor.id }, { workId, runId }, client),
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'NOT_FOUND' })
    expect(await outputOf(db, runId)).toEqual({
      text: HAN_TEXT,
      instructions: INSTRUCTIONS,
      planNotes: [],
    })
  })

  it('repairing twice keeps the first raw draft', async () => {
    const text =
      '첫 문장이다. 그는 三楼 에서 말했다. 그녀는 以上是 말했다. 그는 嬷嬷 를 봤다. 끝 문장이다.'
    let calls = 0
    const { runId, client } = await draftOf(db, actor, workId, text, {
      'draft-repair': (input) => {
        calls += 1
        // One fix per call: the first flag only.
        const { flags, text: current } = input as DraftRepairInput
        return fakeDraftRepair({ text: current, flags: flags.slice(0, 1) })
      },
    })
    const first = await repairDraftForeignScript(db, actor, { workId, runId }, client)
    expect(first.unresolved).toHaveLength(1)

    const second = await repairDraftForeignScript(db, actor, { workId, runId }, client)
    expect(second.unresolved).toEqual([])
    expect(calls).toBe(3)
    expect((await outputOf(db, runId)).rawText).toBe(text)
  })

  it('stores the given text and keeps the other output keys', async () => {
    const { runId, client } = await draftOf(db, actor, workId, CLEAN_TEXT)
    await db
      .update(aiRuns)
      .set({
        output: {
          text: CLEAN_TEXT,
          warnings: [],
          repair: { flagged: 0, applied: 0 },
        },
      })
      .where(eq(aiRuns.id, runId))

    const result = await repairDraftForeignScript(
      db,
      actor,
      { workId, runId, text: HAN_TEXT },
      client,
    )

    const expected = '첫 문장이다. 그는 에서 말했다. 끝 문장이다.'
    expect(result).toEqual({ text: expected, replaced: 1, unresolved: [] })
    expect(await outputOf(db, runId)).toEqual({
      text: expected,
      warnings: [],
      repair: { flagged: 0, applied: 0 },
      rawText: CLEAN_TEXT,
    })
  })

  it('writes nothing when a round fails', async () => {
    const { runId, client } = await draftOf(db, actor, workId, HAN_TEXT, {
      'draft-repair': () => {
        throw new Error('model down')
      },
    })
    const before = await outputOf(db, runId)
    await captureError(repairDraftForeignScript(db, actor, { workId, runId }, client))
    expect(await outputOf(db, runId)).toEqual(before)
  })
})
