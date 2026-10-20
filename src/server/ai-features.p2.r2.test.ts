import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { BEATS_STATE_RULE, type DraftBeats } from '@/ai/tasks/draft-beats'
import { startDraft } from '@/server/ai-features'

const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'
const DRAFT = '서윤은 편지를 펼쳤다. 종이는 눅눅했다.'

const STATE_BEATS: DraftBeats = {
  scenes: [
    {
      place: '장소 1',
      characters: ['등장인물'],
      objects: [],
      sequence: ['서윤이 편지를 발견한다'],
      decision: '서윤은 편지를 아직 펴지 않기로 한다.',
      stake: '답을 바랐지만 얻은 것은 봉투뿐이다.',
    },
    {
      place: '장소 2',
      characters: ['등장인물'],
      objects: [],
      sequence: ['편지에는 날짜가 적혀 있다'],
    },
  ],
}

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id }
}

async function rowsOf(db: Db, workId: string) {
  return db.select().from(aiRuns).where(eq(aiRuns.workId, workId))
}

describe('startDraft with state lines in the beat list (P2)', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  it('passes decision and stake into the prose prompt', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-beats': () => STATE_BEATS,
      },
    })
    const stream = vi.spyOn(client, 'streamText')

    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [], twoStep: true },
      client,
    )
    await run.done

    const prose: string = stream.mock.calls[0][0].prompt
    expect(prose).toContain('결정 상태: 서윤은 편지를 아직 펴지 않기로 한다.')
    expect(prose).toContain('기대한 것과 잃은 것: 답을 바랐지만 얻은 것은 봉투뿐이다.')
    expect(prose.split(BEATS_STATE_RULE).length - 1).toBe(1)
    expect(run.beats).toEqual(STATE_BEATS)
  })

  it('adds no rule when the beat list has no state', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const stream = vi.spyOn(client, 'streamText')

    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [], twoStep: true },
      client,
    )
    await run.done

    const prose: string = stream.mock.calls[0][0].prompt
    expect(prose).toContain('<beats>')
    expect(prose).not.toContain(BEATS_STATE_RULE)
    expect(prose).not.toContain('결정 상태')
  })

  it('keeps the one-step prompt free of state text', async () => {
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
    const prompt: string = stream.mock.calls[0][0].prompt
    expect(prompt).not.toContain('<beats>')
    expect(prompt).not.toContain('결정 상태')
    expect(prompt).not.toContain(BEATS_STATE_RULE)
  })

  it('gives the continuation the same state lines', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => '짧은 초안이다.',
        'draft-beats': () => STATE_BEATS,
      },
    })
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
    const prompt: string = continuation![0].prompt
    expect(prompt).toContain(BEATS_STATE_RULE)
    expect(prompt).toContain('결정 상태: 서윤은 편지를 아직 펴지 않기로 한다.')
    expect((await rowsOf(db, workId)).length).toBeGreaterThan(0)
  })
})
