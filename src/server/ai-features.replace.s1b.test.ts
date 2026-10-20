import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { DRAFT_REPLACE_MARK, parseDraftStream } from '@/lib/draft-stream'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'

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

describe('draft replace record', () => {
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

  function draftInput(extra: { targetChars?: number } = {}) {
    return { workId, instructions: INSTRUCTIONS, targetChars: 5000, entryIds: [], ...extra }
  }

  async function outputOf(runId: string) {
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    return row
  }

  async function readAll(stream: AsyncIterable<string>): Promise<string> {
    let text = ''
    for await (const chunk of stream) text += chunk
    return text
  }

  it('streams a replace record with the spliced text that matches done and the stored text', async () => {
    let call = 0
    const expansions = [grown('가'), grown('나'), grown('다')]
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': () => expansions[call++],
      },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    const streamed = await readAll(textStream)
    const text = await done

    expect(streamed).toContain(DRAFT_REPLACE_MARK)
    expect(parseDraftStream(streamed).text).toBe(text)
    expect(text).not.toBe(DRAFT)
    const row = await outputOf(runId)
    expect((row.output as { text: string }).text).toBe(text)
  })

  it('streams no replace record when the draft reaches the target', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => '가'.repeat(600) },
    })
    const { textStream, done } = await startDraft(
      db,
      actor,
      draftInput({ targetChars: 500 }),
      client,
    )
    const streamed = await readAll(textStream)
    const text = await done

    expect(streamed).not.toContain(DRAFT_REPLACE_MARK)
    expect(streamed).toBe(text)
  })
})
