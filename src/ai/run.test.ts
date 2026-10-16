import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { FakeAiClient } from '@/ai/fake'
import { setAiClientForTests } from '@/ai'
import type { AiClient } from '@/ai/types'
import type { AiTaskDef } from '@/ai/types'
import { assertWithinLimit, getTodayUsage, listAiRuns, runAiTask, startAiStream } from '@/ai/run'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'

const TaskSchema = z.object({ text: z.string() })

const task: AiTaskDef<{ q: string }, { text: string }> = {
  name: 'proofread',
  effort: 'low',
  maxTokens: 100,
  system: '시스템',
  buildPrompt: (input) => input.q,
  schema: TaskSchema,
  fake: (input) => ({ text: `답: ${input.q}` }),
}

const failingClient: AiClient = {
  provider: 'anthropic',
  defaultModel: 'claude-opus-5-5',
  async generateObject() {
    throw new Error('boom')
  },
  streamText() {
    throw new Error('stream boom')
  },
}

const ENV_KEYS = ['AI_DAILY_TOKEN_LIMIT'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  delete process.env.AI_DAILY_TOKEN_LIMIT
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  setAiClientForTests(null)
})

async function setup(): Promise<{ db: Db; userId: string; workId: string }> {
  const db = await createTestDb()
  const user = await createTestUser(db)
  const work = await createTestWork(db, user.id)
  return { db, userId: user.id, workId: work.id }
}

async function insertRun(
  db: Db,
  userId: string,
  values: { inputTokens: number; outputTokens: number; createdAt?: Date },
): Promise<void> {
  await db.insert(aiRuns).values({
    userId,
    task: 'proofread',
    status: 'done',
    model: 'test',
    inputTokens: values.inputTokens,
    outputTokens: values.outputTokens,
    ...(values.createdAt ? { createdAt: values.createdAt } : {}),
  })
}

describe('runAiTask', () => {
  it('stores a done ai_runs row with the output', async () => {
    const { db, userId, workId } = await setup()
    const { output, runId } = await runAiTask(
      db,
      { userId, workId },
      task,
      { q: '안녕' },
      new FakeAiClient(),
    )
    expect(output).toEqual({ text: '답: 안녕' })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.status).toBe('done')
    expect(row.task).toBe('proofread')
    expect(row.workId).toBe(workId)
    expect(row.model).toBe('fake')
    expect(row.output).toEqual({ text: '답: 안녕' })
    expect(row.finishedAt).not.toBeNull()
  })

  it('applies postProcess before storing the output', async () => {
    const { db, userId, workId } = await setup()
    const withPost: AiTaskDef<{ q: string }, { text: string }> = {
      ...task,
      postProcess: (output) => ({ text: output.text.toUpperCase() }),
    }
    const { output, runId } = await runAiTask(
      db,
      { userId, workId },
      withPost,
      { q: 'abc' },
      new FakeAiClient(),
    )
    expect(output).toEqual({ text: '답: ABC' })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.output).toEqual({ text: '답: ABC' })
  })

  it('marks the run as error and throws AI_ERROR when the client fails', async () => {
    const { db, userId, workId } = await setup()
    let caught: unknown
    try {
      await runAiTask(db, { userId, workId }, task, { q: 'x' }, failingClient)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).code).toBe('AI_ERROR')
    expect((caught as AppError).message).toContain('AI 호출에 실패했습니다')

    const rows = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toContain('boom')
  })

  it('uses the client set with setAiClientForTests when none is passed', async () => {
    const { db, userId, workId } = await setup()
    setAiClientForTests(new FakeAiClient())
    const { output } = await runAiTask(db, { userId, workId }, task, { q: '기본' })
    expect(output).toEqual({ text: '답: 기본' })
  })
})

describe('getTodayUsage', () => {
  it('counts only runs since Seoul midnight', async () => {
    const { db, userId } = await setup()
    // Seoul midnight for 2026-10-16T16:00Z is 2026-10-16T15:00Z (2026-10-17 00:00 KST).
    await insertRun(db, userId, {
      inputTokens: 500,
      outputTokens: 500,
      createdAt: new Date('2026-10-16T14:59:00Z'),
    })
    await insertRun(db, userId, {
      inputTokens: 150,
      outputTokens: 50,
      createdAt: new Date('2026-10-16T15:01:00Z'),
    })
    const usage = await getTodayUsage(db, userId, new Date('2026-10-16T16:00:00Z'))
    expect(usage).toBe(200)
  })

  it('ignores other users', async () => {
    const { db, userId } = await setup()
    const other = await createTestUser(db)
    await insertRun(db, other.id, { inputTokens: 1000, outputTokens: 1000 })
    expect(await getTodayUsage(db, userId)).toBe(0)
  })
})

describe('assertWithinLimit', () => {
  it('throws AI_LIMIT when today usage reaches the limit', async () => {
    const { db, userId, workId } = await setup()
    process.env.AI_DAILY_TOKEN_LIMIT = '100'
    await insertRun(db, userId, { inputTokens: 60, outputTokens: 50 })
    await expect(assertWithinLimit(db, userId)).rejects.toMatchObject({ code: 'AI_LIMIT' })

    const before = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    await expect(
      runAiTask(db, { userId, workId }, task, { q: 'x' }, new FakeAiClient()),
    ).rejects.toMatchObject({ code: 'AI_LIMIT' })
    const after = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(after).toHaveLength(before.length)
  })

  it('AI_DAILY_TOKEN_LIMIT=0 disables the limit', async () => {
    const { db, userId, workId } = await setup()
    process.env.AI_DAILY_TOKEN_LIMIT = '0'
    await insertRun(db, userId, { inputTokens: 9_000_000, outputTokens: 9_000_000 })
    await expect(assertWithinLimit(db, userId)).resolves.toBeUndefined()
    const { output } = await runAiTask(
      db,
      { userId, workId },
      task,
      { q: 'ok' },
      new FakeAiClient(),
    )
    expect(output).toEqual({ text: '답: ok' })
  })

  it('defaults to 3,000,000 tokens per Seoul day', async () => {
    const { db, userId } = await setup()
    await insertRun(db, userId, { inputTokens: 2_000_000, outputTokens: 999_999 })
    await expect(assertWithinLimit(db, userId)).resolves.toBeUndefined()
    await insertRun(db, userId, { inputTokens: 1, outputTokens: 0 })
    await expect(assertWithinLimit(db, userId)).rejects.toMatchObject({ code: 'AI_LIMIT' })
  })
})

describe('startAiStream', () => {
  it('stores the streamed text as output when the stream completes', async () => {
    const { db, userId, workId } = await setup()
    const { runId, textStream, done } = await startAiStream(
      db,
      { userId, workId },
      {
        task: 'draft-chapter',
        effort: 'high',
        maxTokens: 500,
        system: '시스템',
        prompt: '초안',
        fake: () => '첫 문단입니다. 둘째 문단입니다.',
      },
      new FakeAiClient(),
    )
    const chunks: string[] = []
    for await (const chunk of textStream) chunks.push(chunk)
    expect(chunks.join('')).toBe('첫 문단입니다. 둘째 문단입니다.')
    await expect(done).resolves.toBe('첫 문단입니다. 둘째 문단입니다.')

    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.status).toBe('done')
    expect(row.output).toEqual({ text: '첫 문단입니다. 둘째 문단입니다.' })
  })

  it('marks the run as error and throws AI_ERROR when streaming cannot start', async () => {
    const { db, userId, workId } = await setup()
    await expect(
      startAiStream(
        db,
        { userId, workId },
        {
          task: 'draft-chapter',
          effort: 'high',
          maxTokens: 500,
          system: 's',
          prompt: 'p',
          fake: () => '',
        },
        failingClient,
      ),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    const rows = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(rows[0].status).toBe('error')
  })
})

describe('listAiRuns', () => {
  it('lists done runs of a task for members, newest first', async () => {
    const { db, userId, workId } = await setup()
    const viewer = await createTestUser(db)
    await addTestMember(db, workId, viewer.id, 'viewer')
    // Explicit timestamps: PGlite's now() has millisecond resolution, so back-to-back inserts tie.
    for (const [text, createdAt] of [
      ['first', new Date('2026-10-16T10:00:00Z')],
      ['second', new Date('2026-10-16T11:00:00Z')],
    ] as const) {
      await db.insert(aiRuns).values({
        workId,
        userId,
        task: 'proofread',
        status: 'done',
        model: 'fake',
        output: { text: `답: ${text}` },
        createdAt,
      })
    }
    await db.insert(aiRuns).values({ workId, userId, task: 'proofread', status: 'error' })
    const rows = await listAiRuns(db, { userId: viewer.id }, workId, { task: 'proofread' })
    expect(rows.map((r) => (r.output as { text: string }).text)).toEqual([
      '답: second',
      '답: first',
    ])
  })

  it('returns NOT_FOUND for non-members', async () => {
    const { db, workId } = await setup()
    const stranger = await createTestUser(db)
    await expect(
      listAiRuns(db, { userId: stranger.id }, workId, { task: 'proofread' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
