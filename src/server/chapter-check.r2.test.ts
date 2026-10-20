import { beforeEach, describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { FAKE_OUTPUTS } from '@/test/ai-fakes'
import type { AiClient } from '@/ai/types'
import { type ContinuityInput, SCENE_PLAN_RULE } from '@/ai/tasks/continuity-check'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { runChapterCheck } from '@/server/chapter-check'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'

// P3: runChapterCheck takes an optional scene plan, which only the continuity call receives.

type Call = { task: string; prompt: string; input: unknown }

let db: Db
let ownerId: string
let workId: string
let actor: Actor

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db)
  ownerId = owner.id
  actor = { userId: ownerId }
  const work = await createTestWork(db, owner.id)
  workId = work.id
}, 120_000)

/** A FakeAiClient that also records the task, prompt and input of every call. */
function recordingClient(calls: Call[]): AiClient {
  const inner = new FakeAiClient()
  return {
    provider: 'fake',
    defaultModel: 'fake',
    async generateObject(args) {
      calls.push({ task: args.task.name, prompt: args.prompt, input: args.task.input })
      return inner.generateObject(args)
    },
    streamText() {
      throw new Error('not used')
    },
  }
}

async function seedChapter() {
  const chapter = await createTestChapter(db, workId, {
    position: 1,
    body: '서윤은 오른손으로 검을 쥐었다.',
  })
  const entry = await createTestEntry(db, workId, { name: '서윤' })
  await createTestFact(db, workId, { content: '서윤은 왼손잡이다.', entryId: entry.id })
  return chapter
}

const PLAN = '장면 1\n장소: 옥탑\n인물: 서윤\n물건: (없음)'

function continuityCalls(calls: Call[]): Call[] {
  return calls.filter((call) => call.task === 'continuity-check')
}

describe('runChapterCheck with a scene plan (P3)', () => {
  it('sends the scene plan to the continuity call and to no other call', async () => {
    const chapter = await seedChapter()
    const calls: Call[] = []
    await runChapterCheck(
      db,
      actor,
      { chapterId: chapter.id, scenePlan: PLAN },
      recordingClient(calls),
    )

    const continuity = continuityCalls(calls)
    expect(continuity).toHaveLength(1)
    expect(continuity[0].prompt).toContain(PLAN)
    expect(continuity[0].prompt).toContain(SCENE_PLAN_RULE)
    expect((continuity[0].input as ContinuityInput).scenePlan).toBe(PLAN)
    for (const call of calls.filter((c) => c.task !== 'continuity-check')) {
      expect(call.prompt).not.toContain('scene_plan')
    }
  })

  it('without a plan the continuity call has no scene_plan section and no scenePlan key', async () => {
    const chapter = await seedChapter()
    const calls: Call[] = []
    await runChapterCheck(db, actor, { chapterId: chapter.id }, recordingClient(calls))

    const continuity = continuityCalls(calls)
    expect(continuity).toHaveLength(1)
    expect(continuity[0].prompt).not.toContain('scene_plan')
    expect(continuity[0].input).not.toHaveProperty('scenePlan')
  })

  it('an empty or null plan is the same as none', async () => {
    for (const scenePlan of ['', null]) {
      const chapter = await seedChapter()
      const calls: Call[] = []
      await runChapterCheck(db, actor, { chapterId: chapter.id, scenePlan }, recordingClient(calls))

      const continuity = continuityCalls(calls)
      expect(continuity[0].prompt).not.toContain('scene_plan')
      expect(continuity[0].input).not.toHaveProperty('scenePlan')
    }
  })

  it('the check result has the same shape with a plan', async () => {
    const chapter = await seedChapter()
    const result = await runChapterCheck(
      db,
      actor,
      { chapterId: chapter.id, scenePlan: PLAN },
      new FakeAiClient(),
    )

    expect(result.runIds.length).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(result.issues)).toBe(true)
    expect(FAKE_OUTPUTS['continuity-check']).toBeDefined()
  })
})
