import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { runAiTask, startAiStream } from '@/ai/run'
import type { AiClient, AiTaskDef, AiUsage } from '@/ai/types'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'

const TaskSchema = z.object({ text: z.string() })

const task: AiTaskDef<{ q: string }, { text: string }> = {
  name: 'proofread',
  effort: 'low',
  maxTokens: 100,
  system: '시스템',
  buildPrompt: (input) => input.q,
  schema: TaskSchema,
}

/** Client that answers with fixed usage and streams the given chunks. */
function usageClient(usage: AiUsage, chunks: string[] = ['가']): AiClient {
  return {
    provider: 'anthropic',
    defaultModel: 'claude-haiku-5-5',
    async generateObject<T>() {
      return { object: { text: '답' } as T, usage, model: 'claude-haiku-5-5' }
    },
    streamText() {
      const textStream = (async function* () {
        for (const chunk of chunks) yield chunk
      })()
      const final = Promise.resolve({ text: chunks.join(''), usage, model: 'claude-haiku-5-5' })
      return { textStream, final }
    },
  }
}

/** Client whose stream fails before any text reaches the caller. */
const earlyFailureClient: AiClient = {
  provider: 'anthropic',
  defaultModel: 'claude-haiku-5-5',
  async generateObject() {
    throw new Error('boom')
  },
  streamText() {
    const textStream = (async function* () {
      throw new Error('stream boom')
    })()
    const final = Promise.reject(new Error('stream boom'))
    final.catch(() => {})
    return { textStream, final }
  },
}

async function setup(): Promise<{ db: Db; userId: string; workId: string }> {
  const db = await createTestDb()
  const user = await createTestUser(db)
  const work = await createTestWork(db, user.id)
  return { db, userId: user.id, workId: work.id }
}

async function onlyRun(db: Db) {
  const rows = await db.select().from(aiRuns)
  expect(rows).toHaveLength(1)
  return rows[0]
}

describe('ai_runs cache and first-token columns', () => {
  it('stores cache reads and writes of a done run', async () => {
    const { db, userId, workId } = await setup()
    await runAiTask(
      db,
      { userId, workId },
      task,
      { q: '질문' },
      usageClient({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 7, cacheWriteTokens: 2 }),
    )
    const row = await onlyRun(db)
    expect(row.status).toBe('done')
    expect(row.cacheReadTokens).toBe(7)
    expect(row.cacheWriteTokens).toBe(2)
    expect(row.firstTokenMs).toBeNull()
  })

  it('stores firstTokenMs for a stream once the first text arrives', async () => {
    const { db, userId, workId } = await setup()
    const { textStream, done } = await startAiStream(
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
      usageClient({ inputTokens: 1, outputTokens: 1 }, ['', '가']),
    )
    for await (const _chunk of textStream) void _chunk
    await done
    const row = await onlyRun(db)
    expect(row.status).toBe('done')
    expect(typeof row.firstTokenMs).toBe('number')
    expect(row.firstTokenMs).toBeGreaterThanOrEqual(0)
  })

  it('leaves firstTokenMs null when the stream fails before any text', async () => {
    const { db, userId, workId } = await setup()
    const { textStream, done } = await startAiStream(
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
      earlyFailureClient,
    )
    await expect(
      (async () => {
        for await (const _chunk of textStream) void _chunk
        await done
      })(),
    ).rejects.toThrow()
    const row = await onlyRun(db)
    expect(row.status).toBe('error')
    expect(row.firstTokenMs).toBeNull()
  })
})
