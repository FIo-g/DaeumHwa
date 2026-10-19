import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { createChapterFromDraft, startDraft } from '@/server/ai-features'

const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'
const DRAFT = '서윤은 편지를 펼쳤다. 종이는 눅눅했다.'
// Each instruction sentence becomes one scene in fakeDraftBeats.
const BEAT_LINE = '1. 서윤이 편지를 발견한다'

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id }
}

async function rowsOf(db: Db, workId: string) {
  return db.select().from(aiRuns).where(eq(aiRuns.workId, workId))
}

describe('startDraft with twoStep (track D)', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  it('asks for the beat list before the prose and passes it into the prose prompt', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const generate = vi.spyOn(client, 'generateObject')
    const stream = vi.spyOn(client, 'streamText')

    // targetChars is tiny so no continuation runs and the stored text is exactly DRAFT.
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [], twoStep: true },
      client,
    )
    await run.done

    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0][0].task.name).toBe('draft-beats')
    expect(generate.mock.invocationCallOrder[0]).toBeLessThan(stream.mock.invocationCallOrder[0])
    const prose = stream.mock.calls[0][0].prompt
    expect(prose).toContain('<beats>')
    expect(prose).toContain(BEAT_LINE)

    const rows = await rowsOf(db, workId)
    expect(rows.map((r) => [r.task, r.status]).sort()).toEqual([
      ['draft-beats', 'done'],
      ['draft-chapter', 'done'],
    ])
    expect(run.beats).toEqual({
      scenes: [
        {
          place: '장소 1',
          characters: ['등장인물'],
          objects: [],
          sequence: ['서윤이 편지를 발견한다'],
        },
        {
          place: '장소 2',
          characters: ['등장인물'],
          objects: [],
          sequence: ['편지에는 날짜가 적혀 있다'],
        },
      ],
    })
    const beatRow = rows.find((r) => r.task === 'draft-beats')
    expect(run.beatsRunId).toBe(beatRow?.id)
    expect(run.runId).toBe(rows.find((r) => r.task === 'draft-chapter')?.id)
  })

  it('makes no beat call and leaves the prose prompt without <beats> when twoStep is omitted', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const generate = vi.spyOn(client, 'generateObject')
    const stream = vi.spyOn(client, 'streamText')

    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [] },
      client,
    )
    await run.done

    expect(generate).not.toHaveBeenCalled()
    expect(stream.mock.calls[0][0].prompt).not.toContain('<beats>')
    const rows = await rowsOf(db, workId)
    expect(rows.map((r) => r.task)).toEqual(['draft-chapter'])
    expect(run.beats).toBeUndefined()
    expect(run.beatsRunId).toBeUndefined()
  })

  it('rejects with AI_ERROR and writes no prose run when the beat call fails', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-beats': () => {
          throw new Error('beat provider down')
        },
      },
    })
    const stream = vi.spyOn(client, 'streamText')

    await expect(
      startDraft(
        db,
        actor,
        { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [], twoStep: true },
        client,
      ),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })

    expect(stream).not.toHaveBeenCalled()
    const rows = await rowsOf(db, workId)
    expect(rows.map((r) => [r.task, r.status])).toEqual([['draft-beats', 'error']])
  })

  it('rejects with AI_ERROR and the Korean message when the beat list is empty', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-beats': () => ({ scenes: [] }) } })
    const stream = vi.spyOn(client, 'streamText')

    await expect(
      startDraft(
        db,
        actor,
        { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [], twoStep: true },
        client,
      ),
    ).rejects.toMatchObject({
      code: 'AI_ERROR',
      message: '장면 목록을 만들지 못했습니다. 다시 시도해 주세요.',
    })

    expect(stream).not.toHaveBeenCalled()
    const rows = await rowsOf(db, workId)
    expect(rows.map((r) => r.task)).toEqual(['draft-beats'])
  })

  it('passes the same beats into the continuation prompt of a short draft', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => '짧은 초안이다.' } })
    const stream = vi.spyOn(client, 'streamText')

    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5500, entryIds: [], twoStep: true },
      client,
    )
    await run.done

    const continuation = stream.mock.calls.find((call) => call[0].task.name === 'draft-continue')
    expect(continuation).toBeDefined()
    expect(continuation?.[0].prompt).toContain('<beats>')
    expect(continuation?.[0].prompt).toContain(BEAT_LINE)
    expect(continuation?.[0].prompt).toContain('<draft_so_far>')
  })

  it('lets createChapterFromDraft save the prose run of a two-step draft', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })

    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [], twoStep: true },
      client,
    )
    await run.done

    const chapter = await createChapterFromDraft(db, actor, { workId, runId: run.runId })
    expect(chapter.body).toBe(DRAFT)
  })
})
