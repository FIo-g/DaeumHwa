import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { draftCharCount } from '@/lib/draft-length'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'

const BREAK = '\n\n***\n\n'
const SCENE_B = '민준은 편지를 읽었다. 종이가 젖어 있었다. '.repeat(53).trim()
const SCENE_C = '도윤은 창을 닫았다. 밖에서 비가 내렸다. '.repeat(53).trim()
// Each span gets an equal share of the 5,000 target, rounded, with no plan card. The ask is 1.1 times that share.
const SHARE = Math.round(5000 / 3)
const ASK = Math.round(SHARE * 1.1)

/** Repeats a sentence until the text reaches the given character count (spaces included). */
function textOfChars(sentence: string, chars: number): string {
  let text = ''
  while (draftCharCount(text) < chars) text += `${sentence} `
  return text.trim()
}

/**
 * A longer span whose sentences are all different. 90 sentences are long enough to pass the 5%
 * growth check even for the span at 95% of its share.
 */
function grown(label: string, count = 90): string {
  return Array.from(
    { length: count },
    (_, i) => `${label}의 장면에서 ${i}번째 감각이 천천히 번졌다.`,
  ).join(' ')
}

describe('draft expansion asks for 1.1 times the share (F5)', () => {
  const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'
  // 95% of the share: under the old 90% pick it was kept, now it is rewritten too.
  const NEAR_SHARE = textOfChars('서윤은 문을 열었다. 바람이 차가웠다.', SHARE * 0.95)
  const DRAFT_NEAR = [NEAR_SHARE, SCENE_B, SCENE_C].join(BREAK)
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

  function draftInput() {
    return { workId, instructions: INSTRUCTIONS, targetChars: 5000, entryIds: [] }
  }

  async function readAll(stream: AsyncIterable<string>): Promise<string> {
    let text = ''
    for await (const chunk of stream) text += chunk
    return text
  }

  async function outputOf(runId: string) {
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    return row
  }

  it('rewrites a span at 95% of its share and asks each span for 1.1 times the share', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT_NEAR,
        'draft-expand': () => grown('가'),
      },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    await done

    const prompts = spy.mock.calls
      .filter((c) => c[0].task.name === 'draft-expand')
      .map((c) => c[0].prompt)
    expect(prompts).toHaveLength(3)
    for (const prompt of prompts) {
      expect(prompt).toContain(`<length>공백 포함 약 ${ASK}자`)
    }
  })

  it('splices an expansion wrapped in scene tags without the tag lines', async () => {
    const expansions = [grown('가'), grown('나'), grown('다')]
    let call = 0
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT_NEAR,
        'draft-expand': () => `<scene>\n${expansions[call++]}\n</scene>`,
      },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    const text = await done

    expect(text).not.toContain('<scene>')
    expect(text).not.toContain('</scene>')
    expect(text.split(BREAK).sort()).toEqual([...expansions].sort())
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text, instructions: INSTRUCTIONS, planNotes: [] })
  })

  it('refuses an expansion with a closing tag in the middle as a note and keeps the span', async () => {
    const note = `${grown('나')}\n</scene>\n더 쓴 문장.`
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT_NEAR,
        'draft-expand': () => note,
      },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    const text = await done

    expect(text).toBe(DRAFT_NEAR)
    const output = (await outputOf(runId)).output as {
      warnings: { reason: string; detail: string }[]
    }
    expect(output.warnings.length).toBeGreaterThan(0)
    for (const warning of output.warnings) {
      expect(warning.reason).toBe('EXPAND_REJECTED')
      expect(warning.detail.startsWith('note: ')).toBe(true)
    }
  })
})
