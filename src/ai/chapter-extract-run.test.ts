import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { runChapterExtract, shouldSplitChapterExtract } from '@/ai/chapter-extract-run'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import type { AiTaskName } from '@/db/types'
import { AppError } from '@/lib/errors'
import type { ChapterExtractInput } from '@/ai/tasks/chapter-extract'
import { FAKE_OUTPUTS } from '@/test/ai-fakes'
import { fakeChapterExtraction } from '@/test/ai-fakes/chapter-extract'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'

let db: Db
let owner: { id: string; name: string; email: string }
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  workId = work.id
}, 120_000)

afterEach(() => {
  delete process.env.AI_EXTRACT_SPLIT
})

const input: ChapterExtractInput = {
  chapterText: '서윤은 검을 쥐었다. 레이아가 웃었다. 서윤은 말이 없었다.',
  chapterPosition: 3,
  chapterTitle: '3화',
  known: [{ name: '서윤', kind: 'character', aliases: ['윤'] }],
  openThreads: [{ ref: 'T1', title: '검의 정체', description: '누가 검을 두었나' }],
  knownFacts: [{ ref: 'F1', subjectName: '서윤', content: '왼손잡이다' }],
}

function meta(signal?: AbortSignal) {
  return { userId: owner.id, workId, chapterId: null, signal }
}

type Call = { name: AiTaskName; prompt: string; inFlightAtStart: number }

/**
 * Counting client. `answer` returns the object for a task (or throws); the default is the fixed
 * fake output of the task. Each call waits a few milliseconds, so overlapping calls are visible.
 */
function countingClient(
  options: {
    provider?: string
    answer?: (name: AiTaskName, prompt: string) => unknown
  } = {},
) {
  const calls: Call[] = []
  let inFlight = 0
  let maxInFlight = 0
  const client: AiClient = {
    provider: options.provider ?? 'ollama',
    defaultModel: 'fake',
    async generateObject(args) {
      const name = args.task.name
      calls.push({ name, prompt: args.prompt, inFlightAtStart: inFlight })
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        await new Promise((resolve) => setTimeout(resolve, 5))
        const raw = options.answer
          ? options.answer(name, args.prompt)
          : FAKE_OUTPUTS[name]?.(args.task.input)
        return {
          object: args.schema.parse(raw),
          usage: { inputTokens: 0, outputTokens: 0 },
          model: 'fake',
        }
      } finally {
        inFlight -= 1
      }
    },
    streamText() {
      throw new Error('not used')
    },
  }
  return {
    client,
    calls,
    names: () => calls.map((c) => c.name),
    maxInFlight: () => maxInFlight,
  }
}

describe('runChapterExtract: split mode', () => {
  it('split mode calls the three parts in order', async () => {
    const counted = countingClient()
    await runChapterExtract(db, meta(), input, counted.client)
    expect(counted.names()).toEqual([
      'chapter-extract-facts',
      'chapter-extract-threads',
      'chapter-extract-relations',
    ])
  })

  it('split mode never runs two calls at once', async () => {
    const counted = countingClient()
    await runChapterExtract(db, meta(), input, counted.client)
    expect(counted.maxInFlight()).toBe(1)
    expect(counted.calls.every((c) => c.inFlightAtStart === 0)).toBe(true)
  })

  it('split mode writes three ai_runs rows, all done', async () => {
    const counted = countingClient()
    const result = await runChapterExtract(db, meta(), input, counted.client)
    const rows = await db.select().from(aiRuns).where(eq(aiRuns.userId, owner.id))
    const byName = new Map(rows.map((row) => [row.task, row]))
    expect([...byName.keys()].sort()).toEqual([
      'chapter-extract-facts',
      'chapter-extract-relations',
      'chapter-extract-threads',
    ])
    for (const row of rows) expect(row.status).toBe('done')
    expect(result.runIds).toHaveLength(3)
    expect(result.runId).toBe(byName.get('chapter-extract-facts')?.id)
    expect(result.runIds[0]).toBe(result.runId)
  })

  it('merged output equals the single-call output for the fake data', async () => {
    const split = await runChapterExtract(db, meta(), input, countingClient({ provider: 'ollama' }).client)
    const single = await runChapterExtract(
      db,
      meta(),
      input,
      countingClient({ provider: 'anthropic' }).client,
    )
    expect(split.output).toEqual(single.output)
    expect(split.output).toEqual(fakeChapterExtraction(input))
  })

  it('relations part sees the new entry names', async () => {
    const text = '레이아는 웃었다. 레이아는 웃었다. 레이아는 웃었다.'
    const counted = countingClient()
    await runChapterExtract(db, meta(), { ...input, chapterText: text }, counted.client)
    const relations = counted.calls.find((c) => c.name === 'chapter-extract-relations')
    expect(relations?.prompt).toContain('레이아')
    expect(relations?.prompt).toContain('승인 대기')
  })

  it('a failing facts part stops the run', async () => {
    const counted = countingClient({
      answer: (name) => {
        if (name === 'chapter-extract-facts') throw new Error('boom')
        return FAKE_OUTPUTS[name]?.(input)
      },
    })
    const error = await runChapterExtract(db, meta(), input, counted.client).catch((e) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('AI_ERROR')
    expect(counted.names()).toEqual(['chapter-extract-facts'])
    const rows = await db.select().from(aiRuns).where(eq(aiRuns.userId, owner.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('error')
  })

  it('a failing relations part keeps the earlier runs recorded', async () => {
    const counted = countingClient({
      answer: (name) => {
        if (name === 'chapter-extract-relations') throw new Error('boom')
        return FAKE_OUTPUTS[name]?.(input)
      },
    })
    await expect(runChapterExtract(db, meta(), input, counted.client)).rejects.toBeInstanceOf(
      AppError,
    )
    const rows = await db.select().from(aiRuns).where(eq(aiRuns.userId, owner.id))
    const status = new Map(rows.map((row) => [row.task, row.status]))
    expect(status.get('chapter-extract-facts')).toBe('done')
    expect(status.get('chapter-extract-threads')).toBe('done')
    expect(status.get('chapter-extract-relations')).toBe('error')
  })

  it('abort signal reaches every part', async () => {
    const counted = countingClient()
    const controller = new AbortController()
    controller.abort()
    const error = await runChapterExtract(
      db,
      meta(controller.signal),
      input,
      counted.client,
    ).catch((e) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('CANCELLED')
    expect(counted.calls).toHaveLength(0)
  })
})

describe('runChapterExtract: single mode', () => {
  it('cloud provider uses one call', async () => {
    const counted = countingClient({ provider: 'anthropic' })
    const result = await runChapterExtract(db, meta(), input, counted.client)
    expect(counted.names()).toEqual(['chapter-extract'])
    expect(result.runIds).toHaveLength(1)
    expect(result.runIds[0]).toBe(result.runId)
  })

  it('options.split overrides the provider', async () => {
    const counted = countingClient({ provider: 'anthropic' })
    await runChapterExtract(db, meta(), input, counted.client, { split: true })
    expect(counted.names()).toEqual([
      'chapter-extract-facts',
      'chapter-extract-threads',
      'chapter-extract-relations',
    ])
  })

  it('AI_EXTRACT_SPLIT env', () => {
    process.env.AI_EXTRACT_SPLIT = 'on'
    expect(shouldSplitChapterExtract('anthropic')).toBe(true)
    process.env.AI_EXTRACT_SPLIT = 'off'
    expect(shouldSplitChapterExtract('ollama')).toBe(false)
    delete process.env.AI_EXTRACT_SPLIT
    expect(shouldSplitChapterExtract('ollama')).toBe(true)
    expect(shouldSplitChapterExtract('eval:ollama')).toBe(true)
    expect(shouldSplitChapterExtract('test')).toBe(false)
    expect(shouldSplitChapterExtract('anthropic')).toBe(false)
  })
})
