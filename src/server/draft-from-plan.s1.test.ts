import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { aiRuns, aiUsageEvents } from '@/db/schema'
import { buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { renderPlanInstructions, withSceneTargets } from '@/lib/draft-plan'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { createTestDb } from '@/test/db'
import {
  createTestEntry,
  createTestFact,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { planDraft, startDraft } from '@/server/ai-features'

async function readAll(stream: AsyncIterable<string>): Promise<string> {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

describe('startDraft from an approved plan card', () => {
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
    db = await createTestDb()
    const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
    const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
    actor = { userId: owner.id }
    workId = work.id
  })

  it('still refuses empty instructions without a plan', async () => {
    await expect(
      startDraft(db, actor, { workId, instructions: '   ', entryIds: [] }, new FakeAiClient()),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '무슨 일이 일어나야 하는지 적어 주세요.',
    })
  })

  it('starts with empty instructions when a plan is given, and sends the card as instructions', async () => {
    const client = new FakeAiClient()
    const planned = await planDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000 },
      client,
    )
    const spy = vi.spyOn(client, 'streamText')

    const { done } = await startDraft(
      db,
      actor,
      {
        workId,
        instructions: '',
        entryIds: [],
        targetChars: 5000,
        plan: planned.card,
        planRunId: planned.runId,
      },
      client,
    )
    await done

    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt).toContain('<scene_budget>장면 3개')
    expect(prompt).toContain(
      `<instructions>\n${renderPlanInstructions('', withSceneTargets(fakeDraftPlan(), 5000))}\n</instructions>`,
    )
  })

  it('recomputes every scene target on the server from the client card', async () => {
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'streamText')
    const card = withSceneTargets(fakeDraftPlan(), 99999)

    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card },
      client,
    )
    await done

    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt).toContain('공백 포함 약 1,667자')
    expect(prompt).not.toContain('99,999')
  })

  it('puts a planned thread named by the card inside the instructions', async () => {
    await createTestThread(db, workId, { title: '편지 봉인', status: 'planned' })
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'streamText')
    const card = {
      ...withSceneTargets(fakeDraftPlan(), 5000),
      threads: ['편지 봉인'],
    }

    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card },
      client,
    )
    await done

    const prompt = spy.mock.calls[0][0].prompt
    const instructions = prompt.slice(
      prompt.indexOf('<instructions>'),
      prompt.indexOf('</instructions>'),
    )
    expect(instructions).toContain('편지 봉인')
  })

  it('picks wiki entries from the approved card, not only from the author line', async () => {
    const entry = await createTestEntry(db, workId, { name: '윤서', summary: '왼손을 다친 검사' })
    await createTestFact(db, workId, { entryId: entry.id, content: '윤서는 왼손을 쓰지 못한다' })
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'streamText')
    const base = withSceneTargets(fakeDraftPlan(), 5000)
    const card = {
      ...base,
      scenes: base.scenes.map((scene, i) =>
        i === 0 ? { ...scene, summary: '윤서가 검을 든다.', characters: ['윤서'] } : scene,
      ),
    }

    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card },
      client,
    )
    await done

    const prompt = spy.mock.calls[0][0].prompt
    const wiki = prompt.slice(prompt.indexOf('<wiki>'), prompt.indexOf('</wiki>'))
    expect(wiki).toContain('윤서는 왼손을 쓰지 못한다')
    // The card is still what the draft reads as its instructions.
    expect(prompt).toContain(`<instructions>\n${renderPlanInstructions('', card)}\n</instructions>`)
  })

  it('stores the text with the plan and plan run id, and records one plan_edited event', async () => {
    const client = new FakeAiClient()
    const planned = await planDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000 },
      client,
    )
    const planEdits = { revisions: 1, removed: 1, moved: 0, textEdits: 1 }

    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      {
        workId,
        instructions: '',
        entryIds: [],
        targetChars: 5000,
        plan: planned.card,
        planRunId: planned.runId,
        planEdits,
      },
      client,
    )
    const streamed = await readAll(textStream)
    const text = await done

    expect(streamed).toBe(text)
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.output).toEqual({ text, plan: planned.card, planRunId: planned.runId })

    const events = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.kind, 'plan_edited'))
    expect(events).toHaveLength(1)
    expect(events[0].value).toBe(3)
    expect(events[0].extra).toEqual(planEdits)
  })

  it('follows the card scene count in the scene budget', async () => {
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'streamText')
    const card = withSceneTargets(
      { ...fakeDraftPlan(), scenes: fakeDraftPlan().scenes.slice(0, 2) },
      5000,
    )

    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card },
      client,
    )
    await done

    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt).toContain(
      '<scene_budget>장면 2개, 장면마다 공백 포함 2500자 안팎</scene_budget>',
    )
  })

  it('still resolves the draft text when the plan cannot be kept in the run', async () => {
    const client = new FakeAiClient()
    const planned = await planDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000 },
      client,
    )
    const realUpdate = db.update.bind(db)
    vi.spyOn(db, 'update').mockImplementation(((table: unknown) => {
      const builder = realUpdate(table as never)
      const realSet = builder.set.bind(builder)
      builder.set = ((values: Record<string, unknown>) => {
        const output = values.output
        if (output && typeof output === 'object' && 'plan' in output) {
          throw new Error('db down')
        }
        return realSet(values)
      }) as typeof builder.set
      return builder
    }) as typeof db.update)

    const { textStream, done } = await startDraft(
      db,
      actor,
      {
        workId,
        instructions: '',
        entryIds: [],
        targetChars: 5000,
        plan: planned.card,
        planRunId: planned.runId,
      },
      client,
    )
    const streamed = await readAll(textStream)
    const text = await done

    expect(text).toBe(streamed)
    expect(text.length).toBeGreaterThan(0)
  })

  it('keeps the draft prompt byte-identical without a plan', async () => {
    const prompt = buildDraftPrompt({
      instructions: '서윤이 편지를 찾는다.',
      targetChars: 5000,
      styleCards: [],
      packText: '(없음)',
      previousSummary: null,
      previousTail: null,
      chapterLabel: '1화 (새 회차)',
    })
    expect(prompt).toBe(
      [
        '<chapter>1화 (새 회차)</chapter>',
        '<target_length>공백 포함 5000자 이상, 6000자 이하</target_length>',
        '<scene_budget>장면 3개, 장면마다 공백 포함 1667자 안팎</scene_budget>',
        '<instructions>',
        '서윤이 편지를 찾는다.',
        '</instructions>',
        '',
        '<style_cards>',
        '(없음)',
        '</style_cards>',
        '',
        '<wiki>',
        '(없음)',
        '</wiki>',
        '',
        '<previous_summary>',
        '(없음)',
        '</previous_summary>',
        '',
        '<previous_tail>',
        '(없음)',
        '</previous_tail>',
      ].join('\n'),
    )
  })
})
