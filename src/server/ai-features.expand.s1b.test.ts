import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { normalizeCard } from '@/lib/draft-plan'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { planDraft, startDraft } from '@/server/ai-features'

const BREAK = '\n\n***\n\n'
// Each scene is about 1,000 characters, so with a 5,000 target and three scenes it is short of its share.
const SCENE_A = '서윤은 문을 열었다. 바람이 차가웠다. '.repeat(53).trim()
const SCENE_B = '민준은 편지를 읽었다. 종이가 젖어 있었다. '.repeat(53).trim()
const SCENE_C = '도윤은 창을 닫았다. 밖에서 비가 내렸다. '.repeat(53).trim()
const DRAFT = [SCENE_A, SCENE_B, SCENE_C].join(BREAK)

/** A longer span whose sentences are all different, so it passes acceptExpansion. */
function grown(label: string, count = 60): string {
  return Array.from(
    { length: count },
    (_, i) => `${label}의 장면에서 ${i}번째 감각이 천천히 번졌다.`,
  ).join(' ')
}

describe('draft expansion', () => {
  const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'
  let db: Db
  let actor: { userId: string }
  let workId: string
  let savedMode: string | undefined

  beforeEach(async () => {
    db = await createTestDb()
    const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
    const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
    actor = { userId: owner.id }
    workId = work.id
    savedMode = process.env.AI_DRAFT_LENGTH_MODE
    delete process.env.AI_DRAFT_LENGTH_MODE
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (savedMode === undefined) delete process.env.AI_DRAFT_LENGTH_MODE
    else process.env.AI_DRAFT_LENGTH_MODE = savedMode
  })

  function draftInput(extra: { targetChars?: number } = {}) {
    return { workId, instructions: INSTRUCTIONS, targetChars: 5000, entryIds: [], ...extra }
  }

  async function outputOf(runId: string) {
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    return row
  }

  async function runsOf(task: 'draft-expand') {
    return db
      .select()
      .from(aiRuns)
      .where(and(eq(aiRuns.workId, workId), eq(aiRuns.task, task)))
  }

  async function readAll(stream: AsyncIterable<string>): Promise<string> {
    let text = ''
    for await (const chunk of stream) text += chunk
    return text
  }

  it('expands each short scene and stores the spliced text', async () => {
    const expansions = [grown('가'), grown('나'), grown('다')]
    let call = 0
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': () => expansions[call++],
      },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    const text = await done

    expect(spy.mock.calls.filter((c) => c[0].task.name === 'draft-expand')).toHaveLength(3)
    // The breaks stay where they were; each scene is one of the expansions, in some order.
    expect(text.split(BREAK).sort()).toEqual([...expansions].sort())
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text })
  })

  it('makes no expansion call when the draft reaches the target', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => '가'.repeat(600) },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { done } = await startDraft(db, actor, draftInput({ targetChars: 500 }), client)
    expect(await done).toBe('가'.repeat(600))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(await runsOf('draft-expand')).toHaveLength(0)
  })

  it('keeps a span whose expansion is shorter and records one EXPAND_REJECTED warning', async () => {
    let call = 0
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': () => (call++ === 0 ? '짧다.' : grown('다')),
      },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    const text = await done

    const pieces = text.split(BREAK)
    expect(pieces.filter((piece) => [SCENE_A, SCENE_B, SCENE_C].includes(piece))).toHaveLength(1)
    const row = await outputOf(runId)
    const output = row.output as { text: string; warnings: unknown[] }
    expect(output.text).toBe(text)
    expect(output.warnings).toEqual([
      {
        kind: 'continue-failed',
        reason: 'EXPAND_REJECTED',
        detail: '짧다.',
        message: '이어쓰기 실패',
      },
    ])
  })

  it('records EXPAND_ERROR for a thrown expansion and keeps the other spans', async () => {
    let call = 0
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': () => {
          if (call++ === 0) throw new Error('boom')
          return grown('나')
        },
      },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    const text = await done

    expect(text.split(BREAK).filter((piece) => piece.startsWith('나의 장면'))).toHaveLength(2)
    const row = await outputOf(runId)
    const output = row.output as { text: string; warnings: { reason: string }[] }
    expect(output.text).toBe(text)
    expect(output.warnings).toHaveLength(1)
    expect(output.warnings[0]).toMatchObject({ kind: 'continue-failed', reason: 'EXPAND_ERROR' })
  })

  it('rejects on abort during expansion and stores nothing but the first text', async () => {
    const controller = new AbortController()
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': () => {
          controller.abort()
          return grown('가')
        },
      },
    })
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      draftInput(),
      client,
      controller.signal,
    )
    const streamed = readAll(textStream)
    await expect(done).rejects.toThrow()
    await expect(streamed).rejects.toThrow()

    const row = await outputOf(runId)
    expect(row.output).toEqual({ text: DRAFT })
  })

  it('makes continuation calls and no expansion when AI_DRAFT_LENGTH_MODE is continue', async () => {
    process.env.AI_DRAFT_LENGTH_MODE = 'continue'
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => DRAFT },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    await done

    const tasks = spy.mock.calls.map((c) => c[0].task.name)
    expect(tasks).toContain('draft-continue')
    expect(tasks).not.toContain('draft-expand')
  })

  it('asks each span for its scene target from the approved plan card', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': () => grown('가'),
      },
    })
    // 4999 on purpose: ceil(4999/3) = 1667 differs from round(4999/3) = 1666,
    // so the test tells the card target from an equal split.
    const planned = await planDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 4999 },
      client,
    )
    const card = normalizeCard(planned.card, 4999)
    const spy = vi.spyOn(client, 'streamText')
    const { textStream, done } = await startDraft(
      db,
      actor,
      {
        ...draftInput({ targetChars: 4999 }),
        instructions: '',
        plan: planned.card,
        planRunId: planned.runId,
      },
      client,
    )
    await readAll(textStream)
    await done

    const prompts = spy.mock.calls
      .filter((c) => c[0].task.name === 'draft-expand')
      .map((c) => c[0].prompt)
    expect(prompts).toHaveLength(3)
    const targets = card.scenes.map((scene) => `약 ${scene.targetChars}자`).sort()
    const asked = prompts.map((prompt) => prompt.match(/약 \d+자/)?.[0] ?? '').sort()
    expect(asked).toEqual(targets)
  })

  it('skips the expansion when under 30 seconds of the 290 second budget remain, with no warning', async () => {
    let offset = 0
    const base = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => base + offset)
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => {
          offset = 270_000
          return DRAFT
        },
      },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    expect(await done).toBe(DRAFT)
    expect(spy.mock.calls.filter((c) => c[0].task.name === 'draft-expand')).toHaveLength(0)
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text: DRAFT })
    expect(row.output).not.toHaveProperty('warnings')
  })
})
