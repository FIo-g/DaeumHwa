import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { DRAFT_ERROR_MARK, DRAFT_REPLACE_MARK, parseDraftStream } from '@/lib/draft-stream'
import { withSceneTargets } from '@/lib/draft-plan'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'

const BREAK = '\n\n***\n\n'
// Each scene is about 1,000 characters, so with a 5,000 target and three scenes it is short of its share.
const SCENE_A = '서윤은 문을 열었다. 바람이 차가웠다. '.repeat(53).trim()
const SCENE_B = '민준은 편지를 읽었다. 종이가 젖어 있었다. '.repeat(53).trim()
const SCENE_C = '도윤은 창을 닫았다. 밖에서 비가 내렸다. '.repeat(53).trim()
// The first scene carries a replace mark in the middle of its text.
const MARKED_SCENE_A = `${SCENE_A} 앞 문장${DRAFT_REPLACE_MARK}뒤 문장 끝.`
const SHORT_DRAFT = [MARKED_SCENE_A, SCENE_B, SCENE_C].join(BREAK)

/** A longer span whose sentences are all different, so it passes acceptExpansion. */
function grown(label: string, count = 60): string {
  return Array.from(
    { length: count },
    (_, i) => `${label}의 장면에서 ${i}번째 감각이 천천히 번졌다.`,
  ).join(' ')
}

describe('stream marks in model text', () => {
  const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'
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

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function draftInput(extra: { targetChars?: number } = {}) {
    return { workId, instructions: INSTRUCTIONS, targetChars: 5000, entryIds: [], ...extra }
  }

  async function storedText(runId: string): Promise<string> {
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    return (row.output as { text: string }).text
  }

  async function readAll(stream: AsyncIterable<string>): Promise<string> {
    let text = ''
    for await (const chunk of stream) text += chunk
    return text
  }

  it('strips a replace mark from a draft that needs no expansion', async () => {
    const draft = `앞 문장${DRAFT_REPLACE_MARK}뒤 문장 끝. ${'가'.repeat(600)}`
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => draft } })
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      draftInput({ targetChars: 500 }),
      client,
    )
    const streamed = await readAll(textStream)
    const text = await done

    expect(streamed).not.toContain(DRAFT_REPLACE_MARK)
    const parsed = parseDraftStream(streamed)
    expect(parsed.error).toBeNull()
    expect(parsed.text).toContain('뒤 문장')
    expect(parsed.text).toBe(text)
    expect(await storedText(runId)).toBe(text)
  })

  it('keeps streamed, spliced and stored text equal when an expansion follows a mark', async () => {
    let call = 0
    const expansions = [grown('가'), grown('나'), grown('다')]
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => SHORT_DRAFT,
        'draft-expand': () => expansions[call++],
      },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    const streamed = await readAll(textStream)
    const text = await done

    // The mark of the replace record is the only one in the body: two of them, as a pair.
    expect(streamed.split(DRAFT_REPLACE_MARK)).toHaveLength(3)
    const parsed = parseDraftStream(streamed)
    expect(parsed.error).toBeNull()
    expect(parsed.text).toBe(text)
    expect(text).not.toBe(SHORT_DRAFT.replace(DRAFT_REPLACE_MARK, ''))
    expect(await storedText(runId)).toBe(text)
    for (const recorded of client.recorded)
      expect(recorded.prompt).not.toContain(DRAFT_REPLACE_MARK)
  })

  it('writes the stripped first text back when every expansion is refused', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => SHORT_DRAFT,
        // Shorter than the span, so acceptExpansion refuses it.
        'draft-expand': () => '짧다.',
      },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    const streamed = await readAll(textStream)
    const text = await done

    expect(streamed).not.toContain(DRAFT_REPLACE_MARK)
    expect(parseDraftStream(streamed).text).toBe(text)
    expect(text).toContain('뒤 문장')
    expect(await storedText(runId)).toBe(text)
  })

  it('strips the error mark from model text, so the draft is not read as a failure', async () => {
    const draft = `앞 문장${DRAFT_ERROR_MARK}뒤 문장 끝. ${'가'.repeat(600)}`
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => draft } })
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      draftInput({ targetChars: 500 }),
      client,
    )
    const streamed = await readAll(textStream)
    const text = await done

    expect(streamed).not.toContain(DRAFT_ERROR_MARK)
    const parsed = parseDraftStream(streamed)
    expect(parsed.error).toBeNull()
    expect(parsed.text).toContain('뒤 문장')
    expect(parsed.text).toBe(text)
    expect(await storedText(runId)).toBe(text)
  })

  it('strips marks from the continuation in continue mode', async () => {
    vi.stubEnv('AI_DRAFT_LENGTH_MODE', 'continue')
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => `앞 문장${DRAFT_REPLACE_MARK}뒤 문장 끝.`,
        'draft-continue': () =>
          `바람이${DRAFT_REPLACE_MARK} 잦아들었다.${DRAFT_ERROR_MARK} 아침 빛이 들어왔다.`,
      },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    const streamed = await readAll(textStream)
    const text = await done

    expect(streamed).not.toContain(DRAFT_REPLACE_MARK)
    expect(streamed).not.toContain(DRAFT_ERROR_MARK)
    expect(text).toContain('뒤 문장')
    expect(text).toContain('잦아들었다.')
    // No replace record in continue mode, so the streamed body is the stored text as it is.
    expect(streamed).toBe(text)
    expect(await storedText(runId)).toBe(text)
  })

  it('strips marks from every scene in scenes mode', async () => {
    const card = withSceneTargets(fakeDraftPlan(), 5000)
    let call = 0
    const later = [`나${DRAFT_REPLACE_MARK}나`, `다${DRAFT_ERROR_MARK}다`]
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => `가${DRAFT_REPLACE_MARK}가`,
        'draft-scene': () => later[call++],
      },
    })
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card, mode: 'scenes' },
      client,
    )
    const streamed = await readAll(textStream)
    const text = await done

    const joined = `가가${BREAK}나나${BREAK}다다`
    expect(streamed).toBe(joined)
    expect(text).toBe(joined)
    expect(parseDraftStream(streamed).error).toBeNull()
    expect(await storedText(runId)).toBe(joined)
  })
})
