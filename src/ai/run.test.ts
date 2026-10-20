import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { FakeAiClient } from '@/test/fake-ai'
import { setAiClientForTests } from '@/ai'
import type { AiClient } from '@/ai/types'
import type { AiTaskDef } from '@/ai/types'
import {
  AI_CANCELLED_MESSAGE,
  AI_TIMEOUT_MESSAGE,
  DEFAULT_AI_TIMEOUT_MS,
  STREAM_AI_TIMEOUT_MS,
  assertWithinLimit,
  getTodayUsage,
  listAiRuns,
  replaceRunOutput,
  runAiTask,
  setAiTimeoutOverride,
  startAiStream,
} from '@/ai/run'
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
}

/** Fake client that answers the test task (`proofread`) with `답: <q>`. */
function taskClient(): FakeAiClient {
  return new FakeAiClient({
    overrides: { proofread: (input) => ({ text: `답: ${(input as { q: string }).q}` }) },
  })
}

const failingClient: AiClient = {
  provider: 'anthropic',
  defaultModel: 'claude-haiku-5-5',
  async generateObject() {
    throw new Error('boom')
  },
  streamText() {
    throw new Error('stream boom')
  },
}

/** Client whose call failed after the API billed tokens (refusal, max_tokens, missing output). */
function billedFailureClient(usage: { inputTokens: number; outputTokens: number }): AiClient {
  return {
    provider: 'anthropic',
    defaultModel: 'claude-haiku-5-5',
    async generateObject() {
      throw new AppError('AI_ERROR', '응답이 너무 길어 중간에 끊겼습니다.', { usage })
    },
    streamText() {
      return {
        textStream: (async function* () {})(),
        final: Promise.reject(
          new AppError('AI_ERROR', '응답이 너무 길어 중간에 끊겼습니다.', { usage }),
        ),
      }
    },
  }
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
  values: {
    inputTokens: number
    outputTokens: number
    createdAt?: Date
    status?: 'done' | 'running' | 'error'
  },
): Promise<void> {
  await db.insert(aiRuns).values({
    userId,
    task: 'proofread',
    status: values.status ?? 'done',
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
      taskClient(),
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
      taskClient(),
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
    setAiClientForTests(taskClient())
    const { output } = await runAiTask(db, { userId, workId }, task, { q: '기본' })
    expect(output).toEqual({ text: '답: 기본' })
  })
})

describe('failed runs', () => {
  it('counts tokens the API billed before the call failed', async () => {
    const { db, userId, workId } = await setup()
    const client = billedFailureClient({ inputTokens: 100, outputTokens: 200 })
    const error = await runAiTask(db, { userId, workId }, task, { q: 'x' }, client).catch(
      (e: unknown) => e,
    )
    expect(error).toMatchObject({ code: 'AI_ERROR' })
    // The browser must not receive the usage details.
    expect((error as AppError).details).toBeUndefined()

    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(row.status).toBe('error')
    expect(row.inputTokens).toBe(100)
    expect(row.outputTokens).toBe(200)
    expect(await getTodayUsage(db, userId)).toBe(300)
  })

  it('counts billed tokens for a stream that fails after the API call', async () => {
    const { db, userId, workId } = await setup()
    const client = billedFailureClient({ inputTokens: 40, outputTokens: 60 })
    const { done } = await startAiStream(
      db,
      { userId, workId },
      {
        task: 'draft-chapter',
        effort: 'high',
        maxTokens: 500,
        system: 's',
        prompt: 'p',
        input: { instructions: '' },
      },
      client,
    )
    const error = await done.catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'AI_ERROR' })
    expect((error as AppError).details).toBeUndefined()

    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(row.status).toBe('error')
    expect(row.inputTokens).toBe(40)
    expect(row.outputTokens).toBe(60)
  })

  it('keeps the usage of a successful call when postProcess throws', async () => {
    const { db, userId, workId } = await setup()
    const client: AiClient = {
      ...failingClient,
      async generateObject(args) {
        return {
          object: args.schema.parse({ text: '답' }),
          usage: { inputTokens: 50, outputTokens: 70 },
          model: 'm',
        }
      },
    }
    const withBadPost: AiTaskDef<{ q: string }, { text: string }> = {
      ...task,
      postProcess: () => {
        throw new Error('bad post')
      },
    }
    await expect(
      runAiTask(db, { userId, workId }, withBadPost, { q: 'x' }, client),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(row.status).toBe('error')
    expect(row.inputTokens).toBe(50)
    expect(row.outputTokens).toBe(70)
  })

  it('records zero tokens for an error that carries no usage', async () => {
    const { db, userId, workId } = await setup()
    const client: AiClient = {
      ...failingClient,
      async generateObject() {
        throw new AppError('AI_LIMIT', '한도')
      },
    }
    await expect(runAiTask(db, { userId, workId }, task, { q: 'x' }, client)).rejects.toMatchObject(
      { code: 'AI_LIMIT' },
    )
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(row.inputTokens).toBe(0)
    expect(row.outputTokens).toBe(0)
  })
})

describe('concurrent runs', () => {
  it('rejects a new run while the user already has 3 running runs', async () => {
    const { db, userId, workId } = await setup()
    for (let i = 0; i < 3; i++)
      await insertRun(db, userId, { inputTokens: 0, outputTokens: 0, status: 'running' })
    const error = await runAiTask(db, { userId, workId }, task, { q: 'x' }, taskClient()).catch(
      (e: unknown) => e,
    )
    expect(error).toMatchObject({ code: 'CONFLICT' })
    expect((error as AppError).code).not.toBe('AI_LIMIT')
    const rows = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(rows).toHaveLength(3)
  })

  it('also applies to startAiStream', async () => {
    const { db, userId, workId } = await setup()
    for (let i = 0; i < 3; i++)
      await insertRun(db, userId, { inputTokens: 0, outputTokens: 0, status: 'running' })
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
          input: { instructions: '' },
        },
        taskClient(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('allows a run when fewer than 3 are running, and ignores running rows older than 10 minutes', async () => {
    const { db, userId, workId } = await setup()
    await insertRun(db, userId, { inputTokens: 0, outputTokens: 0, status: 'running' })
    await insertRun(db, userId, { inputTokens: 0, outputTokens: 0, status: 'running' })
    const old = new Date(Date.now() - 11 * 60 * 1000)
    await insertRun(db, userId, {
      inputTokens: 0,
      outputTokens: 0,
      status: 'running',
      createdAt: old,
    })
    const { output } = await runAiTask(db, { userId, workId }, task, { q: 'ok' }, taskClient())
    expect(output).toEqual({ text: '답: ok' })
  })

  it('lets a sub-run start past the cap but still checks the daily limit', async () => {
    const { db, userId, workId } = await setup()
    for (let i = 0; i < 3; i++)
      await insertRun(db, userId, { inputTokens: 0, outputTokens: 0, status: 'running' })
    const args = {
      task: 'draft-expand' as const,
      effort: 'low' as const,
      maxTokens: 500,
      system: 's',
      prompt: 'p',
      input: { instructions: '' },
    }
    const client = new FakeAiClient({ overrides: { 'draft-expand': () => '확장' } })
    const stream = await startAiStream(db, { userId, workId, subRun: true }, args, client)
    expect(await stream.done).toBe('확장')

    process.env.AI_DAILY_TOKEN_LIMIT = '100'
    await insertRun(db, userId, { inputTokens: 60, outputTokens: 50 })
    await expect(
      startAiStream(db, { userId, workId, subRun: true }, args, client),
    ).rejects.toMatchObject({ code: 'AI_LIMIT' })
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
      runAiTask(db, { userId, workId }, task, { q: 'x' }, taskClient()),
    ).rejects.toMatchObject({ code: 'AI_LIMIT' })
    const after = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(after).toHaveLength(before.length)
  })

  it('accepts thousands separators and underscores in AI_DAILY_TOKEN_LIMIT', async () => {
    const { db, userId } = await setup()
    process.env.AI_DAILY_TOKEN_LIMIT = '500,000'
    await insertRun(db, userId, { inputTokens: 300_000, outputTokens: 199_999 })
    await expect(assertWithinLimit(db, userId)).resolves.toBeUndefined()
    await insertRun(db, userId, { inputTokens: 1, outputTokens: 0 })
    await expect(assertWithinLimit(db, userId)).rejects.toMatchObject({ code: 'AI_LIMIT' })

    process.env.AI_DAILY_TOKEN_LIMIT = '1_000'
    await expect(assertWithinLimit(db, userId)).rejects.toMatchObject({ code: 'AI_LIMIT' })
  })

  it('falls back to the default with a warning when AI_DAILY_TOKEN_LIMIT is unreadable', async () => {
    const { db, userId } = await setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      process.env.AI_DAILY_TOKEN_LIMIT = 'five hundred'
      await insertRun(db, userId, { inputTokens: 2_000_000, outputTokens: 0 })
      await expect(assertWithinLimit(db, userId)).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('AI_DAILY_TOKEN_LIMIT=0 disables the limit', async () => {
    const { db, userId, workId } = await setup()
    process.env.AI_DAILY_TOKEN_LIMIT = '0'
    await insertRun(db, userId, { inputTokens: 9_000_000, outputTokens: 9_000_000 })
    await expect(assertWithinLimit(db, userId)).resolves.toBeUndefined()
    const { output } = await runAiTask(db, { userId, workId }, task, { q: 'ok' }, taskClient())
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
        input: { instructions: '' },
      },
      new FakeAiClient({
        overrides: { 'draft-chapter': () => '첫 문단입니다. 둘째 문단입니다.' },
      }),
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
          input: { instructions: '' },
        },
        failingClient,
      ),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    const rows = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(rows[0].status).toBe('error')
  })
})

describe('cancel and timeout', () => {
  const usage = { inputTokens: 0, outputTokens: 0 }
  const streamArgs = {
    task: 'draft-chapter' as const,
    effort: 'high' as const,
    maxTokens: 500,
    system: 's',
    prompt: 'p',
    input: { instructions: '' },
  }

  it('records a run as error and throws CANCELLED when the signal is already aborted', async () => {
    const { db, userId, workId } = await setup()
    const controller = new AbortController()
    controller.abort()
    const client = taskClient()
    const spy = vi.spyOn(client, 'generateObject')
    await expect(
      runAiTask(db, { userId, workId, signal: controller.signal }, task, { q: '안녕' }, client),
    ).rejects.toMatchObject({ code: 'CANCELLED', message: AI_CANCELLED_MESSAGE })
    expect(spy).not.toHaveBeenCalled()
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(row.status).toBe('error')
    expect(row.error).toBe('취소했습니다.')
  })

  it('records the timeout message when the client gives up on time', async () => {
    const { db, userId, workId } = await setup()
    const timingOut: AiClient = {
      ...failingClient,
      async generateObject() {
        throw new AppError('AI_ERROR', AI_TIMEOUT_MESSAGE)
      },
    }
    await expect(
      runAiTask(db, { userId, workId }, task, { q: '안녕' }, timingOut),
    ).rejects.toMatchObject({ code: 'AI_ERROR', message: AI_TIMEOUT_MESSAGE })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(row.status).toBe('error')
    expect(row.error).toBe(AI_TIMEOUT_MESSAGE)
  })

  it('records a cancel that lands after the answer arrived as cancelled, keeping the billed tokens', async () => {
    const { db, userId, workId } = await setup()
    const controller = new AbortController()
    const client: AiClient = {
      ...failingClient,
      async generateObject() {
        controller.abort()
        return { object: { text: '답' } as never, usage, model: 'claude-haiku-5-5' }
      },
    }
    await expect(
      runAiTask(db, { userId, workId, signal: controller.signal }, task, { q: '안녕' }, client),
    ).rejects.toMatchObject({ code: 'CANCELLED', message: '취소했습니다.' })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.workId, workId))
    expect(row.status).toBe('error')
    expect(row.inputTokens).toBe(usage.inputTokens)
    expect(row.outputTokens).toBe(usage.outputTokens)
  })

  it('maps an abort raised by the client to CANCELLED when the signal is aborted', async () => {
    const { db, userId, workId } = await setup()
    const controller = new AbortController()
    const client: AiClient = {
      ...failingClient,
      async generateObject() {
        controller.abort()
        throw new Error('This operation was aborted')
      },
    }
    await expect(
      runAiTask(db, { userId, workId, signal: controller.signal }, task, { q: '안녕' }, client),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('passes meta.timeoutMs, then task.timeoutMs, then the 120 second default to the client', async () => {
    const { db, userId, workId } = await setup()
    const seen: (number | undefined)[] = []
    const client: AiClient = {
      ...failingClient,
      async generateObject(args) {
        seen.push(args.timeoutMs)
        return { object: { text: '답' } as never, usage, model: 'claude-haiku-5-5' }
      },
    }
    await runAiTask(db, { userId, workId }, task, { q: '하나' }, client)
    await runAiTask(db, { userId, workId }, { ...task, timeoutMs: 90_000 }, { q: '둘' }, client)
    await runAiTask(
      db,
      { userId, workId, timeoutMs: 5_000 },
      { ...task, timeoutMs: 90_000 },
      { q: '셋' },
      client,
    )
    expect(seen).toEqual([120_000, 90_000, 5_000])
  })

  it('marks a stream as error and rejects done with CANCELLED when the stream is aborted', async () => {
    const { db, userId, workId } = await setup()
    const controller = new AbortController()
    const client: AiClient = {
      ...failingClient,
      streamText() {
        return {
          textStream: (async function* () {
            yield '첫 줄'
            await new Promise(() => {})
          })(),
          final: new Promise((_, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('aborted')))
          }),
        }
      },
    }
    const { runId, done } = await startAiStream(
      db,
      { userId, workId, signal: controller.signal },
      streamArgs,
      client,
    )
    controller.abort()
    await expect(done).rejects.toMatchObject({ code: 'CANCELLED', message: AI_CANCELLED_MESSAGE })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.status).toBe('error')
    expect(row.error).toBe(AI_CANCELLED_MESSAGE)
  })

  it('throws CANCELLED before streaming when the signal is already aborted', async () => {
    const { db, userId, workId } = await setup()
    const controller = new AbortController()
    controller.abort()
    await expect(
      startAiStream(db, { userId, workId, signal: controller.signal }, streamArgs, taskClient()),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(row.status).toBe('error')
  })
})

/**
 * Client that never answers. It rejects once its signal aborts, the way a fetch or SDK call
 * does. `onCall` runs when the call starts.
 */
function neverSettlingClient(onCall?: () => void): AiClient {
  const rejectOnAbort = (signal: AbortSignal | undefined) =>
    new Promise<never>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('This operation was aborted')))
    })
  return {
    ...failingClient,
    generateObject(args) {
      onCall?.()
      return rejectOnAbort(args.signal)
    },
    streamText(args) {
      onCall?.()
      return {
        textStream: (async function* () {
          await rejectOnAbort(args.signal)
        })(),
        final: rejectOnAbort(args.signal),
      }
    },
  }
}

describe('overall deadline', () => {
  const streamArgs = {
    task: 'draft-chapter' as const,
    effort: 'high' as const,
    maxTokens: 500,
    system: 's',
    prompt: 'p',
    input: { instructions: '' },
  }

  it('ends a structured call at the deadline with the timeout message and an error run', async () => {
    const { db, userId, workId } = await setup()
    await expect(
      runAiTask(db, { userId, workId, timeoutMs: 30 }, task, { q: '안녕' }, neverSettlingClient()),
    ).rejects.toMatchObject({ code: 'AI_ERROR', message: AI_TIMEOUT_MESSAGE })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(row.status).toBe('error')
    expect(row.error).toBe(AI_TIMEOUT_MESSAGE)
  })

  it('ends a stream at the deadline: done rejects with the timeout message and the run is error', async () => {
    const { db, userId, workId } = await setup()
    const { runId, done } = await startAiStream(
      db,
      { userId, workId, timeoutMs: 30 },
      streamArgs,
      neverSettlingClient(),
    )
    await expect(done).rejects.toMatchObject({ code: 'AI_ERROR', message: AI_TIMEOUT_MESSAGE })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.status).toBe('error')
    expect(row.error).toBe(AI_TIMEOUT_MESSAGE)
  })

  it('gives the client a signal that aborts at the deadline', async () => {
    const { db, userId, workId } = await setup()
    let seen: AbortSignal | undefined
    const client: AiClient = {
      ...failingClient,
      generateObject(args) {
        seen = args.signal
        return new Promise<never>(() => {})
      },
    }
    void runAiTask(db, { userId, workId, timeoutMs: 30 }, task, { q: '안녕' }, client).catch(
      () => undefined,
    )
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(seen?.aborted).toBe(true)
  })

  it('keeps a user cancel as CANCELLED when it lands before the deadline', async () => {
    const { db, userId, workId } = await setup()
    const controller = new AbortController()
    let onCall!: () => void
    const called = new Promise<void>((resolve) => (onCall = resolve))
    const pending = runAiTask(
      db,
      { userId, workId, signal: controller.signal, timeoutMs: 60_000 },
      task,
      { q: '안녕' },
      neverSettlingClient(onCall),
    )
    await called
    controller.abort()
    await expect(pending).rejects.toMatchObject({
      code: 'CANCELLED',
      message: AI_CANCELLED_MESSAGE,
    })
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
    expect(row.error).toBe(AI_CANCELLED_MESSAGE)
  })

  it('keeps a user cancel as CANCELLED on a stream that also has a deadline', async () => {
    const { db, userId, workId } = await setup()
    const controller = new AbortController()
    let onCall!: () => void
    const called = new Promise<void>((resolve) => (onCall = resolve))
    const { done } = await startAiStream(
      db,
      { userId, workId, signal: controller.signal, timeoutMs: 60_000 },
      streamArgs,
      neverSettlingClient(onCall),
    )
    await called
    controller.abort()
    await expect(done).rejects.toMatchObject({ code: 'CANCELLED', message: AI_CANCELLED_MESSAGE })
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

describe('setAiTimeoutOverride (eval seam)', () => {
  afterEach(() => {
    setAiTimeoutOverride(null)
  })

  it('caps runAiTask at the override and reports AI_TIMEOUT when it fires', async () => {
    const { db, userId, workId } = await setup()
    const client: AiClient = {
      provider: 'test',
      defaultModel: 'fake',
      generateObject({ signal }) {
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      },
      streamText() {
        throw new Error('not used')
      },
    }
    setAiTimeoutOverride(30)
    const started = Date.now()
    await expect(runAiTask(db, { userId, workId }, task, { q: 'x' }, client)).rejects.toMatchObject(
      { code: 'AI_ERROR', message: AI_TIMEOUT_MESSAGE },
    )
    expect(Date.now() - started).toBeLessThan(200)
  })

  it('passes DEFAULT_AI_TIMEOUT_MS to runAiTask again after the override is cleared', async () => {
    const { db, userId, workId } = await setup()
    const seen: number[] = []
    const client: AiClient = {
      provider: 'test',
      defaultModel: 'fake',
      async generateObject(args) {
        seen.push(args.timeoutMs ?? -1)
        const object = args.schema.parse({ text: 'ok' })
        return { object, usage: { inputTokens: 0, outputTokens: 0 }, model: 'fake' }
      },
      streamText() {
        throw new Error('not used')
      },
    }
    setAiTimeoutOverride(30)
    setAiTimeoutOverride(null)
    await runAiTask(db, { userId, workId }, task, { q: 'x' }, client)
    expect(seen).toEqual([DEFAULT_AI_TIMEOUT_MS])
  })

  it('caps startAiStream at the override and reports AI_TIMEOUT when it fires', async () => {
    const { db, userId, workId } = await setup()
    const client: AiClient = {
      provider: 'test',
      defaultModel: 'fake',
      async generateObject() {
        throw new Error('not used')
      },
      streamText({ signal }) {
        const final = new Promise<never>((_, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
        return { textStream: (async function* () {})(), final }
      },
    }
    setAiTimeoutOverride(30)
    const started = Date.now()
    const { done } = await startAiStream(
      db,
      { userId, workId },
      { task: 'proofread', input: {}, effort: 'low', maxTokens: 10, system: '', prompt: '' },
      client,
    )
    await expect(done).rejects.toMatchObject({ code: 'AI_ERROR', message: AI_TIMEOUT_MESSAGE })
    expect(Date.now() - started).toBeLessThan(200)
  })

  it('passes STREAM_AI_TIMEOUT_MS to startAiStream again after the override is cleared', async () => {
    const { db, userId, workId } = await setup()
    const seen: number[] = []
    const client: AiClient = {
      provider: 'test',
      defaultModel: 'fake',
      async generateObject() {
        throw new Error('not used')
      },
      streamText(args) {
        seen.push(args.timeoutMs ?? -1)
        const final = Promise.resolve({
          text: 'ok',
          usage: { inputTokens: 0, outputTokens: 0 },
          model: 'fake',
        })
        return { textStream: (async function* () {})(), final }
      },
    }
    setAiTimeoutOverride(30)
    setAiTimeoutOverride(null)
    const { done } = await startAiStream(
      db,
      { userId, workId },
      { task: 'proofread', input: {}, effort: 'low', maxTokens: 10, system: '', prompt: '' },
      client,
    )
    await done
    expect(seen).toEqual([STREAM_AI_TIMEOUT_MS])
  })
})

describe('replaceRunOutput', () => {
  it('changes the output of a done run and keeps its status and tokens', async () => {
    const { db, userId, workId } = await setup()
    const client: AiClient = {
      provider: 'test',
      defaultModel: 'fake',
      async generateObject() {
        throw new Error('not used')
      },
      streamText() {
        const text = '첫 글'
        return {
          textStream: (async function* () {
            yield text
          })(),
          final: Promise.resolve({
            text,
            usage: { inputTokens: 7, outputTokens: 9 },
            model: 'fake',
          }),
        }
      },
    }
    const { runId, done } = await startAiStream(
      db,
      { userId, workId },
      {
        task: 'draft-chapter',
        effort: 'high',
        maxTokens: 500,
        system: '시스템',
        prompt: '초안',
        input: { instructions: '' },
      },
      client,
    )
    await done

    await replaceRunOutput(db, runId, { text: '첫 글 이어 쓴 글', warnings: [] })

    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.output).toEqual({ text: '첫 글 이어 쓴 글', warnings: [] })
    expect(row.status).toBe('done')
    expect(row.inputTokens).toBe(7)
    expect(row.outputTokens).toBe(9)
  })
})
