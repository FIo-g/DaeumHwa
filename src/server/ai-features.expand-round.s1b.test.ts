import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { DRAFT_REPLACE_MARK, parseDraftStream } from '@/lib/draft-stream'
import { draftCharCount } from '@/lib/draft-length'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'

const BREAK = '\n\n***\n\n'
// Three equal scenes of about 1,000 characters. Their names differ, so the test can tell them apart.
const SCENE_A = '서윤은 편지를 읽었다. '.repeat(77).trim()
const SCENE_B = '민준은 편지를 읽었다. '.repeat(77).trim()
const SCENE_C = '도윤은 편지를 읽었다. '.repeat(77).trim()
const DRAFT = [SCENE_A, SCENE_B, SCENE_C].join(BREAK)
// Six short scenes with break lines, so the spans are the six scenes.
const SHORT = '서윤은 문을 열었다. '.repeat(20).trim()
const SIX_SCENES = Array.from({ length: 6 }, () => SHORT).join(BREAK)

/** A run of one character: one sentence, so it never trips the repeat check. */
function chars(mark: string, count: number): string {
  return mark.repeat(count)
}

describe('draft expansion runs a second round (F5b)', () => {
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

  async function readAll(stream: AsyncIterable<string>): Promise<string> {
    let text = ''
    for await (const chunk of stream) text += chunk
    return text
  }

  /** Feeds the expansions in call order, so each call gets the next one. */
  function inOrder(outputs: string[]): () => string {
    let call = 0
    return () => outputs[call++]
  }

  it('asks round 2 only for spans under 1.1 times their share, from their current text', async () => {
    // Target 5,000 gives three spans with shares of 1,667. Span 0 (2,000) is above 1.1 times its
    // share (1,833). Span 1 (1,750) is between its share and that line, so only round 2 picks it.
    // Span 2 (1,200) is under its share.
    const round1 = [chars('가', 2000), chars('나', 1750), chars('다', 1200)]
    const round1Text = round1.join(BREAK)
    const round2 = [chars('라', 1800), chars('마', 2100)]
    const next = inOrder([...round1, ...round2])
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => DRAFT, 'draft-expand': next },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    const text = await done

    const expandPrompts = spy.mock.calls
      .filter((c) => c[0].task.name === 'draft-expand')
      .map((c) => c[0].prompt)
    expect(expandPrompts).toHaveLength(5)
    // Round 2 asks the larger of 1.2 times the span and the span plus its part of the gap to 1.1 times target.
    // The gap is 5,500 - 4,956 = 544 (the separators count 3 characters each), shared by two picked spans.
    // Span 2: 1,200 + 272 = 1,472 beats 1,440, so the gap term applies.
    // Span 1: 1,750 + 272 = 2,022 is below 1.2 times 1,750 = 2,100, so the floor applies.
    expect(draftCharCount(round1Text)).toBe(4956)
    expect(expandPrompts[3]).toContain(`<scene>\n${chars('다', 1200)}\n</scene>`)
    expect(expandPrompts[3]).toContain('<length>공백 포함 약 1472자 (지금 1200자)')
    expect(expandPrompts[4]).toContain(`<scene>\n${chars('나', 1750)}\n</scene>`)
    expect(expandPrompts[4]).toContain('<length>공백 포함 약 2100자 (지금 1750자)')

    // The stored text is the round-2 splice: span 2 takes the first round-2 output, span 1 the second.
    expect(text).toBe([round1[0], round2[1], round2[0]].join(BREAK))
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text })
  })

  it('asks 1.2 times the span when round 1 ends near target and the gap is small', async () => {
    // Round 1 gives three spans of 1,700 characters, so the draft is 5,106 (102% of target).
    const round1 = [chars('가', 1700), chars('나', 1700), chars('다', 1700)]
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': inOrder([
          ...round1,
          chars('라', 2040),
          chars('마', 2040),
          chars('바', 2040),
        ]),
      },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    await done

    const expandPrompts = spy.mock.calls
      .filter((c) => c[0].task.name === 'draft-expand')
      .map((c) => c[0].prompt)
    expect(expandPrompts).toHaveLength(6)
    // The gap term is 1,700 + (5,500 - 5,106) / 3 = 1,831, below the floor of 1.2 times 1,700 = 2,040.
    for (const prompt of expandPrompts.slice(3)) {
      expect(prompt).toContain('<length>공백 포함 약 2040자 (지금 1700자)')
    }
  })

  it('makes no round-2 call when round 1 reaches 1.05 times target', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': inOrder([chars('가', 1800), chars('나', 1800), chars('다', 1800)]),
      },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    await done

    expect(spy.mock.calls.filter((c) => c[0].task.name === 'draft-expand')).toHaveLength(3)
  })

  it('still runs round 2 when round 1 ends exactly at target', async () => {
    const round1 = [chars('가', 1700), chars('나', 1700), chars('다', 1700)]
    // Target is the length of the round-1 text, so round 1 ends exactly on it.
    const target = draftCharCount(round1.join(BREAK))
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': inOrder([...round1, ...round1]),
      },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { textStream, done } = await startDraft(
      db,
      actor,
      draftInput({ targetChars: target }),
      client,
    )
    await readAll(textStream)
    await done

    expect(spy.mock.calls.filter((c) => c[0].task.name === 'draft-expand')).toHaveLength(6)
  })

  it('makes no round-2 call with less than 30 seconds of the budget left after round 1', async () => {
    let calls = 0
    const base = Date.now()
    let offset = 0
    vi.spyOn(Date, 'now').mockImplementation(() => base + offset)
    const outputs = [chars('가', 1200), chars('나', 1200), chars('다', 1200)]
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': () => {
          // The third span is the last call of round 1. Its start leaves 25 s of the budget.
          if (calls++ === 2) offset = 265_000
          return outputs[calls - 1]
        },
      },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    const text = await done

    expect(spy.mock.calls.filter((c) => c[0].task.name === 'draft-expand')).toHaveLength(3)
    expect(text).toBe(outputs.join(BREAK))
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text })
  })

  it('streams one replace record per round that accepts a rewrite, and the last equals the stored text', async () => {
    const outputs = [
      chars('가', 2000),
      chars('나', 1200),
      chars('다', 1200),
      chars('라', 1800),
      chars('마', 1800),
    ]
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => DRAFT, 'draft-expand': inOrder(outputs) },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    const streamed = await readAll(textStream)
    const text = await done

    expect(streamed.split(DRAFT_REPLACE_MARK)).toHaveLength(5)
    expect(parseDraftStream(streamed).text).toBe(text)
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text })
  })

  it('keeps the round-1 EXPAND_REJECTED warning after round 2 succeeds', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => DRAFT,
        'draft-expand': inOrder([
          '짧다.',
          chars('나', 1200),
          chars('다', 1200),
          chars('라', 1800),
          chars('마', 1800),
          chars('바', 1800),
        ]),
      },
    })
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    const text = await done

    const row = await outputOf(runId)
    const output = row.output as { text: string; warnings: unknown[] }
    expect(output.text).toBe(text)
    expect(output.warnings).toEqual([
      {
        kind: 'continue-failed',
        reason: 'EXPAND_REJECTED',
        detail: 'short: 짧다.',
        message: '이어쓰기 실패',
      },
    ])
  })

  it('makes at most four expansion calls per round', async () => {
    // Six scenes of about 240 characters, each under its 833 share, so round 1 picks the four
    // shortest (the first four) and rewrites each to 900 characters. The 900 is above the share and
    // under 1.1 times it (916), so round 2 picks it again. Round 2 takes the four lowest ratios:
    // the two untouched scenes and two of the 900-character ones. It asks for 1,000 characters each.
    const outputs = [
      ...Array.from({ length: 4 }, () => chars('가', 900)),
      ...Array.from({ length: 4 }, () => chars('나', 1000)),
    ]
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => SIX_SCENES, 'draft-expand': inOrder(outputs) },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { textStream, done } = await startDraft(db, actor, draftInput(), client)
    await readAll(textStream)
    await done

    const expandCalls = spy.mock.calls.filter((c) => c[0].task.name === 'draft-expand')
    // Four calls in round 1 and four in round 2: never more than four per round.
    expect(expandCalls).toHaveLength(8)
  })
})
