import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { aiUsageEvents, chapters } from '@/db/schema'
import { buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { draftLengthPlan } from '@/lib/draft-length'
import { withSceneTargets } from '@/lib/draft-plan'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { buildDraftContext, planDraft, runDirectionAdvice } from '@/server/ai-features'

describe('planDraft', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    db = await createTestDb()
    const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
    const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
    actor = { userId: owner.id }
    workId = work.id
  })

  it('returns a card with a target for every scene and records one plan_shown event', async () => {
    const { runId, card, warnings } = await planDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000 },
      new FakeAiClient(),
    )

    expect(card.scenes).toHaveLength(3)
    for (const scene of card.scenes) {
      expect(scene.targetChars).toBe(draftLengthPlan(5000, 3).charsPerScene)
    }
    expect(warnings).toEqual([])
    expect(runId).toEqual(expect.any(String))

    const events = await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.kind, 'plan_shown'))
    expect(events).toHaveLength(1)
    expect(events[0].value).toBe(3)
  })

  it('refuses a non-member with NOT_FOUND', async () => {
    const stranger = await createTestUser(db, { name: '외부인', email: 'stranger@example.com' })
    await expect(
      planDraft(
        db,
        { userId: stranger.id },
        { workId, instructions: '', entryIds: [] },
        new FakeAiClient(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('sends the author note and the revised scene count with a revision', async () => {
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'generateObject')
    // The default scene count for 9000 is 6, so a 3-scene prompt shows the card's count is used.
    const card = withSceneTargets(fakeDraftPlan(), 9000)

    await planDraft(
      db,
      actor,
      {
        workId,
        instructions: '',
        entryIds: [],
        targetChars: 9000,
        revision: { card, note: '2장면에서 윤서가 먼저 말을 건다' },
      },
      client,
    )

    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt).toContain('작가 메모: 2장면에서 윤서가 먼저 말을 건다')
    expect(prompt).toContain('<scene_count>3</scene_count>')
    expect(prompt).not.toContain('<scene_count>6</scene_count>')
  })

  it('sends the text of the newest direction advice in the prompt', async () => {
    const client = new FakeAiClient()
    await runDirectionAdvice(db, actor, { workId }, client)
    const spy = vi.spyOn(client, 'generateObject')

    await planDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000 },
      client,
    )

    expect(spy.mock.calls[0][0].prompt).toContain('(데모) 정면 대결')
  })

  it('builds the plan prompt from the same context as the draft prompt', async () => {
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'generateObject')

    await planDraft(
      db,
      actor,
      { workId, instructions: '서윤이 편지를 찾는다', entryIds: [], targetChars: 5000 },
      client,
    )

    const context = await buildDraftContext(db, actor, {
      workId,
      instructions: '서윤이 편지를 찾는다',
      targetChars: 5000,
      entryIds: [],
    })
    const draftPrompt = buildDraftPrompt(
      { ...context.promptInput, beats: null },
      { omitTargetLength: true },
    )
    expect(spy.mock.calls[0][0].prompt.startsWith(draftPrompt)).toBe(true)
  })

  it('lets a planner with an empty line see the entries named in the previous chapter', async () => {
    await createTestChapter(db, workId, {
      position: 1,
      body: '윤서는 종소리를 들으며 계단을 올랐다.',
    })
    const entry = await createTestEntry(db, workId, { name: '윤서', summary: '왼손을 다친 검사' })
    await createTestFact(db, workId, { entryId: entry.id, content: '윤서는 왼손을 쓰지 못한다' })
    await createTestEntry(db, workId, { name: '세린', summary: '종루지기' })
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'generateObject')

    await planDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000 },
      client,
    )

    const prompt = spy.mock.calls[0][0].prompt
    const wiki = prompt.slice(prompt.indexOf('<wiki>'), prompt.indexOf('</wiki>'))
    expect(wiki).toContain('윤서는 왼손을 쓰지 못한다')
    expect(wiki).not.toContain('세린')
  })

  it('lets a planner with an empty line see the entries named in the previous summary', async () => {
    const first = await createTestChapter(db, workId, { position: 1, body: '조용한 밤이었다.' })
    await db
      .update(chapters)
      .set({ summary: '세린이 종루에 올랐다.' })
      .where(eq(chapters.id, first.id))
    await createTestEntry(db, workId, { name: '세린', summary: '종루지기' })
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'generateObject')

    await planDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000 },
      client,
    )

    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt.slice(prompt.indexOf('<wiki>'), prompt.indexOf('</wiki>'))).toContain('종루지기')
  })

  it('keeps the plan pack on the author line when there is one', async () => {
    await createTestChapter(db, workId, {
      position: 1,
      body: '윤서는 종소리를 들으며 계단을 올랐다.',
    })
    await createTestEntry(db, workId, { name: '윤서', summary: '왼손을 다친 검사' })
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'generateObject')

    await planDraft(
      db,
      actor,
      { workId, instructions: '비 오는 밤의 추격전', entryIds: [], targetChars: 5000 },
      client,
    )

    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt.slice(prompt.indexOf('<wiki>'), prompt.indexOf('</wiki>'))).not.toContain('윤서')
  })
})
