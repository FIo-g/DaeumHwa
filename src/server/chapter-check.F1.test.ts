import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { AiClient, GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import type { Actor } from '@/db/types'
import { AppError } from '@/lib/errors'
import { runProofread } from '@/server/chapter-check'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'

// Proofread split into parts (track F1). Kept apart from chapter-check.test.ts (spec 5).

let db: Db
let owner: { id: string; name: string; email: string }
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  workId = work.id
}, 120_000)

function actor(userId: string): Actor {
  return { userId }
}

type ProofreadCall = { text: string; timeoutMs?: number }

/**
 * Client for proofread calls only. It records each call, tracks how many calls are in flight, and
 * answers with `answer(text, callIndex)`; `onCall` runs first and may abort or delay the call.
 */
function recordingClient(
  answer: (text: string, index: number) => unknown,
  options: {
    provider?: string
    onCall?: (index: number, args: GenerateObjectArgs<unknown>) => void
  } = {},
) {
  const calls: ProofreadCall[] = []
  let inFlight = 0
  let maxInFlight = 0
  const client: AiClient = {
    provider: options.provider ?? 'ollama',
    defaultModel: 'fake',
    async generateObject(args) {
      const text = (args.task.input as { text: string }).text
      const index = calls.length
      calls.push({ text, timeoutMs: args.timeoutMs })
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        options.onCall?.(index, args)
        const object = args.schema.parse(answer(text, index))
        return { object, usage: { inputTokens: 0, outputTokens: 0 }, model: 'fake' }
      } finally {
        inFlight -= 1
      }
    },
    streamText() {
      throw new Error('not used')
    },
  }
  return { client, calls, maxInFlight: () => maxInFlight }
}

/** Suggestions for the quote `어색해요`, the only quote these tests use. */
const AWKWARD = { quote: '어색해요', replacement: '어색합니다', kind: 'spacing', reason: '이유' }

/** Answers `어색해요` whenever the part contains it. */
function awkwardWhenPresent(text: string) {
  return { suggestions: text.includes('어색해요') ? [AWKWARD] : [] }
}

/** A block of exactly 2,000 characters that starts with `head` and has no newline. */
function block(head: string): string {
  return head.padEnd(2000, '가')
}

/** Three blocks joined by blank lines: 6,004 characters, cuts after the two blank lines. */
function threeBlocks(heads: [string, string, string]): string {
  return heads.map(block).join('\n\n')
}

async function countRuns(status?: 'done' | 'error' | 'running') {
  const rows = await db
    .select()
    .from(aiRuns)
    .where(
      status
        ? and(eq(aiRuns.workId, workId), eq(aiRuns.task, 'proofread'), eq(aiRuns.status, status))
        : and(eq(aiRuns.workId, workId), eq(aiRuns.task, 'proofread')),
    )
  return rows
}

describe('runProofread: split into parts', () => {
  it('short text makes one call with the default time limit', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = '그는 걸었다. '.repeat(125)
    expect(text.length).toBe(1000)
    const { client, calls } = recordingClient(awkwardWhenPresent)

    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      client,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].timeoutMs).toBe(120_000)
    expect(result.runIds).toHaveLength(1)
    expect(result.runId).toBe(result.runIds[0])
  })

  it('long text makes three sequential calls, each with a 95 s limit', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = threeBlocks(['가 나', '다 라', '마 바'])
    expect(text.length).toBe(6004)
    const { client, calls, maxInFlight } = recordingClient(() => ({ suggestions: [] }))

    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      client,
    )

    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c.text.trim())).toEqual([
      block('가 나'),
      block('다 라'),
      block('마 바'),
    ])
    expect(calls[0].text.endsWith('\n\n')).toBe(true)
    expect(calls[1].text.endsWith('\n\n')).toBe(true)
    expect(calls.every((c) => c.timeoutMs === 95_000)).toBe(true)
    expect(maxInFlight()).toBe(1)
    expect(await countRuns('done')).toHaveLength(3)
    expect(result.runIds).toHaveLength(3)
    expect(result.runId).toBe(result.runIds[2])
  })

  it('offsets are whole-text offsets', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = threeBlocks(['가 나', '다 어색해요. 라', '마 바'])
    const { client } = recordingClient(awkwardWhenPresent)

    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      client,
    )

    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai).toHaveLength(1)
    expect(ai[0].start).toBe(text.indexOf('어색해요'))
    expect(text.slice(ai[0].start, ai[0].end)).toBe('어색해요')
  })

  it('the same quote in two parts gives one suggestion per occurrence, no duplicates', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = threeBlocks(['가 어색해요. 나', '다 라', '마 어색해요. 바'])
    const { client } = recordingClient(awkwardWhenPresent)

    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      client,
    )

    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai.map((s) => s.start)).toEqual([text.indexOf('어색해요'), text.lastIndexOf('어색해요')])
  })

  it('a quote that spans a cut is dropped, the rest kept', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const first = block('가 어색해요. 나')
    const second = block('다 라')
    const text = `${first}\n\n${second}\n\n${block('마 바')}`
    // Last two characters of part 1, the blank line, then the first two of part 2.
    const spanning = `${first.slice(-2)}\n\n${second.slice(0, 2)}`
    const { client } = recordingClient((partText) => ({
      suggestions: [
        { quote: spanning, replacement: '고친말', kind: 'spelling', reason: '걸친 표현' },
        ...awkwardWhenPresent(partText).suggestions,
      ],
    }))

    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      client,
    )

    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai.map((s) => s.quote)).toEqual(['어색해요'])
    expect(ai[0].start).toBe(text.indexOf('어색해요'))
  })

  it('rule suggestions stay whole-text and still win overlaps', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = threeBlocks(['가 나', '다 라', '마 안 되요. 바'])
    const { client } = recordingClient((partText) => ({
      suggestions: partText.includes('되요')
        ? [{ quote: '되요', replacement: '돼요', kind: 'spelling', reason: '중복' }]
        : [],
    }))

    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      client,
    )

    expect(result.suggestions.map((s) => [s.source, s.quote, s.start])).toEqual([
      ['rule', '되요', text.indexOf('되요')],
    ])
  })

  it('the 20-occurrence cap is per chapter, not per part', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const headed = '어색해요. '.repeat(7)
    const text = threeBlocks([headed, headed, headed])
    const { client, calls } = recordingClient(awkwardWhenPresent)

    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      client,
    )

    expect(calls).toHaveLength(3)
    expect(result.suggestions.filter((s) => s.source === 'ai')).toHaveLength(20)
  })

  it('a failing part stops the run', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = threeBlocks(['가 나', '다 라', '마 바'])
    const { client, calls } = recordingClient((_text, index) => {
      if (index === 1) throw new AppError('AI_ERROR', 'x')
      return { suggestions: [] }
    })

    let error: unknown
    try {
      await runProofread(db, actor(owner.id), { chapterId: chapter.id, text, useAi: true }, client)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('AI_ERROR')
    expect(calls).toHaveLength(2)
    const rows = await countRuns()
    expect(rows.map((r) => r.status).sort()).toEqual(['done', 'error'])
  })

  it('cancel stops before the next part', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = threeBlocks(['가 나', '다 라', '마 바'])
    const controller = new AbortController()
    const { client, calls } = recordingClient(() => ({ suggestions: [] }), {
      onCall: (index) => {
        if (index === 0) controller.abort()
      },
    })

    let error: unknown
    try {
      await runProofread(
        db,
        actor(owner.id),
        { chapterId: chapter.id, text, useAi: true },
        client,
        controller.signal,
      )
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('CANCELLED')
    expect(calls).toHaveLength(1)
    expect(await countRuns('running')).toHaveLength(0)
    const rows = await countRuns()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toBe('취소했습니다.')
  })

  it('useAi false makes no AI call', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const { client, calls } = recordingClient(() => ({ suggestions: [] }))

    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: threeBlocks(['가 나', '다 라', '마 바']), useAi: false },
      client,
    )

    expect(calls).toHaveLength(0)
    expect(result.runIds).toEqual([])
    expect(result.runId).toBeNull()
  })

  it('a cloud provider keeps one call for a long text', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const { client, calls } = recordingClient(() => ({ suggestions: [] }), {
      provider: 'anthropic',
    })

    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: threeBlocks(['가 나', '다 라', '마 바']), useAi: true },
      client,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].timeoutMs).toBe(120_000)
    expect(result.runIds).toHaveLength(1)
  })

  it('the fake client keeps one call for a long text', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: '가'.repeat(6000), useAi: true },
      new FakeAiClient(),
    )
    expect(result.runIds).toHaveLength(1)
  })

  it('accepts AI proofreading at exactly the limit in three parts', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const { client } = recordingClient(() => ({ suggestions: [] }))
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: '가'.repeat(30_000), useAi: true },
      client,
    )
    expect(result.runIds).toHaveLength(3)
    expect(result.runId).toBe(result.runIds[2])
  })
})
