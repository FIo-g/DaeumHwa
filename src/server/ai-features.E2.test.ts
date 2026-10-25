import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import { createChapterFromDraft, repairDraft, startDraft } from '@/server/ai-features'
import { createStyleCard } from '@/server/styles'

const SAMPLE = '안개가 계단을 반쯤 삼키고 있었다.'
const NEW_SENTENCE = '계단 아래로 안개가 번져 갔다.'
const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'

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

describe('repairDraft', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  /** A work card holding SAMPLE, and a draft whose text contains SAMPLE. */
  async function sampleDraft(extraOverrides: Record<string, (input: unknown) => unknown> = {}) {
    await createStyleCard(db, actor, { workId, name: '작품 문체', examples: SAMPLE })
    const text = `세린은 문을 닫았다. ${SAMPLE}`
    const repaired = { edits: [{ quote: SAMPLE, replacement: NEW_SENTENCE }] }
    const draft = await draftOf(db, actor, workId, text, {
      'draft-repair': () => repaired,
      ...extraOverrides,
    })
    return { ...draft, text }
  }

  it('repairs a copied sentence, stores the original text and creates the chapter from it', async () => {
    const { runId, client, text } = await sampleDraft()
    const result = await repairDraft(db, actor, { workId, runId }, client)

    const expected = `세린은 문을 닫았다. ${NEW_SENTENCE}`
    expect(result).toEqual({ runId, text: expected, flagged: 1, applied: 1 })
    expect(await outputOf(db, runId)).toEqual({
      text: expected,
      originalText: text,
      repair: { flagged: 1, applied: 1 },
      instructions: INSTRUCTIONS,
      planNotes: [],
    })

    const chapter = await createChapterFromDraft(db, actor, { workId, runId })
    expect(chapter.body).toBe(expected)
  })

  it('makes no AI call when there is nothing to flag', async () => {
    const client = new FakeAiClient()
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 500, entryIds: [] },
      client,
    )
    await run.done
    const result = await repairDraft(db, actor, { workId, runId: run.runId }, client)
    expect(result).toMatchObject({ flagged: 0, applied: 0 })
    expect(await repairRows(db, workId)).toEqual([])
    expect(await outputOf(db, run.runId)).toMatchObject({ repair: { flagged: 0, applied: 0 } })
  })

  it('is idempotent: a second call returns the stored result with no new AI call', async () => {
    let calls = 0
    const { runId, client } = await sampleDraft({
      'draft-repair': () => {
        calls += 1
        return { edits: [{ quote: SAMPLE, replacement: NEW_SENTENCE }] }
      },
    })
    const first = await repairDraft(db, actor, { workId, runId }, client)
    const second = await repairDraft(db, actor, { workId, runId }, client)
    expect(second).toEqual(first)
    expect(calls).toBe(1)
    expect(await repairRows(db, workId)).toHaveLength(1)
  })

  it('ignores an edit whose quote is outside the flagged sentences', async () => {
    const { runId, client, text } = await sampleDraft({
      'draft-repair': () => ({
        edits: [{ quote: '세린은 문을 닫았다.', replacement: '그는 떠났다.' }],
      }),
    })
    const result = await repairDraft(db, actor, { workId, runId }, client)
    expect(result).toEqual({ runId, text, flagged: 1, applied: 0 })
  })

  it('returns NOT_FOUND to a non-member', async () => {
    const { runId, client } = await sampleDraft()
    const outsider = await createTestUser(db, { email: 'outsider@example.com' })
    const error = await captureError(
      repairDraft(db, { userId: outsider.id }, { workId, runId }, client),
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns FORBIDDEN to a viewer', async () => {
    const { runId, client } = await sampleDraft()
    const viewer = await createTestUser(db, { email: 'viewer@example.com' })
    await addTestMember(db, workId, viewer.id, 'viewer')
    const error = await captureError(
      repairDraft(db, { userId: viewer.id }, { workId, runId }, client),
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns BAD_STATE while the draft run is still running', async () => {
    const { runId, client } = await sampleDraft()
    await db.update(aiRuns).set({ status: 'running' }).where(eq(aiRuns.id, runId))
    const error = await captureError(repairDraft(db, actor, { workId, runId }, client))
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'BAD_STATE' })
  })

  it('returns NOT_FOUND for a run that is not a draft', async () => {
    const { runId, client } = await sampleDraft()
    await db.update(aiRuns).set({ task: 'proofread' }).where(eq(aiRuns.id, runId))
    const error = await captureError(repairDraft(db, actor, { workId, runId }, client))
    expect(error).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('flags the given text instead of the stored one', async () => {
    await createStyleCard(db, actor, { workId, name: '작품 문체', examples: SAMPLE })
    const given = `세린은 문을 닫았다. ${SAMPLE}`
    const { runId, client } = await draftOf(db, actor, workId, '세린은 문을 닫았다. 종이 울렸다.', {
      'draft-repair': () => ({ edits: [{ quote: SAMPLE, replacement: NEW_SENTENCE }] }),
    })
    const result = await repairDraft(db, actor, { workId, runId, text: given }, client)

    const expected = `세린은 문을 닫았다. ${NEW_SENTENCE}`
    expect(result).toEqual({ runId, text: expected, flagged: 1, applied: 1 })
    expect(await outputOf(db, runId)).toMatchObject({ text: expected, originalText: given })
  })

  it('keeps the warnings and rawText keys next to repair', async () => {
    const { runId, client } = await sampleDraft()
    await db
      .update(aiRuns)
      .set({ output: { text: 'seed', warnings: [], rawText: 'raw' } })
      .where(eq(aiRuns.id, runId))
    await repairDraft(db, actor, { workId, runId }, client)
    expect(await outputOf(db, runId)).toMatchObject({ warnings: [], rawText: 'raw' })
    expect(await outputOf(db, runId)).toHaveProperty('repair')
  })

  it('keeps any other output key', async () => {
    const draft = await draftOf(db, actor, workId, '세린은 문을 닫았다. 종이 울렸다.')
    await db
      .update(aiRuns)
      .set({ output: { text: '세린은 문을 닫았다. 종이 울렸다.', extra: 1 } })
      .where(eq(aiRuns.id, draft.runId))
    await repairDraft(db, actor, { workId, runId: draft.runId }, draft.client)
    expect(await outputOf(db, draft.runId)).toMatchObject({ extra: 1 })
  })

  it('finds repeated English words only when lang is en', async () => {
    const text = 'Her left hand shook. '.repeat(9)
    const english = await draftOf(db, actor, workId, text, {
      'draft-repair': () => ({ edits: [] }),
    })
    const withLang = await repairDraft(
      db,
      actor,
      { workId, runId: english.runId, lang: 'en' },
      english.client,
    )
    expect(withLang).toMatchObject({ flagged: 6, applied: 0 })
    expect(await repairRows(db, workId)).toHaveLength(1)

    const fresh = await draftOf(db, actor, workId, text, { 'draft-repair': () => ({ edits: [] }) })
    const withoutLang = await repairDraft(db, actor, { workId, runId: fresh.runId }, fresh.client)
    expect(withoutLang).toMatchObject({ flagged: 0, applied: 0 })
    expect(await repairRows(db, workId)).toHaveLength(1)
  })
})
