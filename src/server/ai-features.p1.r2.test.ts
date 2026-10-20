import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'
import type { DraftBeats } from '@/ai/tasks/draft-beats'

// Round 2 P1: the beat call gets the planned scene count, and the prose budget follows the list.

const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'
const DRAFT = '서윤은 편지를 펼쳤다. 종이는 눅눅했다.'

function scenesOf(n: number): DraftBeats {
  return {
    scenes: Array.from({ length: n }, (_, i) => ({
      place: `장소 ${i + 1}`,
      characters: ['서윤'],
      objects: [],
      sequence: [`사건 ${i + 1}`],
    })),
  }
}

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id }
}

describe('P1 startDraft scene count (round 2)', () => {
  beforeEach(() => {
    // These tests check the append continuation, which is the `continue` length mode.
    vi.stubEnv('AI_DRAFT_LENGTH_MODE', 'continue')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  it('tells the beat call the planned scene count', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const generate = vi.spyOn(client, 'generateObject')
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5500, entryIds: [], twoStep: true },
      client,
    )
    await run.done
    expect(generate.mock.calls[0][0].prompt).toContain('<scene_count>4</scene_count>')
  })

  it('tells the beat call 8 scenes at 12100 characters', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const generate = vi.spyOn(client, 'generateObject')
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 12100, entryIds: [], twoStep: true },
      client,
    )
    await run.done
    expect(generate.mock.calls[0][0].prompt).toContain('<scene_count>8</scene_count>')
  })

  it('keeps the prose scene budget at the plan when the list has the planned length', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-beats': () => scenesOf(4), 'draft-chapter': () => DRAFT },
    })
    const stream = vi.spyOn(client, 'streamText')
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5500, entryIds: [], twoStep: true },
      client,
    )
    await run.done
    expect(stream.mock.calls[0][0].prompt).toContain(
      '<scene_budget>장면 4개, 장면마다 공백 포함 1375자 안팎</scene_budget>',
    )
  })

  it('makes the prose scene budget follow a longer beat list', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-beats': () => scenesOf(6), 'draft-chapter': () => DRAFT },
    })
    const stream = vi.spyOn(client, 'streamText')
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5500, entryIds: [], twoStep: true },
      client,
    )
    await run.done
    const prose = stream.mock.calls[0][0].prompt
    expect(prose).toContain('<scene_budget>장면 6개, 장면마다 공백 포함 917자 안팎</scene_budget>')
    expect(prose).not.toContain('장면 4개')
  })

  it('makes the prose scene budget follow a shorter beat list', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-beats': () => scenesOf(2), 'draft-chapter': () => DRAFT },
    })
    const stream = vi.spyOn(client, 'streamText')
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5500, entryIds: [], twoStep: true },
      client,
    )
    await run.done
    expect(stream.mock.calls[0][0].prompt).toContain(
      '<scene_budget>장면 2개, 장면마다 공백 포함 2750자 안팎</scene_budget>',
    )
  })

  it('uses the same budget in the continuation', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-beats': () => scenesOf(6), 'draft-chapter': () => '짧은 초안이다.' },
    })
    const stream = vi.spyOn(client, 'streamText')
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5500, entryIds: [], twoStep: true },
      client,
    )
    await run.done
    const cont = stream.mock.calls.find((c) => c[0].task.name === 'draft-continue')
    expect(cont?.[0].prompt).toContain(
      '<scene_budget>장면 6개, 장면마다 공백 포함 917자 안팎</scene_budget>',
    )
  })

  it('leaves the one-step draft alone', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const generate = vi.spyOn(client, 'generateObject')
    const stream = vi.spyOn(client, 'streamText')
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5500, entryIds: [] },
      client,
    )
    await run.done
    expect(generate).not.toHaveBeenCalled()
    const prose = stream.mock.calls[0][0].prompt
    expect(prose).toContain('장면 4개, 장면마다 공백 포함 1375자 안팎')
    expect(prose).not.toContain('<scene_count>')
    expect(prose).not.toContain('<beats>')
  })
})
