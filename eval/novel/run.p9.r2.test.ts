import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { AppError } from '@/lib/errors'
import { createRun, openRun, type RunContext } from './run'

// openRun wiring of the retry client (P9). Offline: a local node:http server stands in for Ollama.

const USAGE: AiUsage = { inputTokens: 10, outputTokens: 5 }

const dirs: string[] = []
let savedBaseUrl: string | undefined
let server: Server | undefined
let ctx: (RunContext & { close(): Promise<void> }) | undefined

beforeEach(() => {
  savedBaseUrl = process.env.OLLAMA_BASE_URL
})

afterEach(async () => {
  if (ctx) await ctx.close()
  ctx = undefined
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  server = undefined
  if (savedBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL
  else process.env.OLLAMA_BASE_URL = savedBaseUrl
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-p9-'))
  dirs.push(dir)
  return dir
}

function qwenRun(dir: string): void {
  createRun(dir, {
    modelId: 'qwen3.8-27b',
    lang: 'ko',
    chapters: 1,
    questions: 1,
    maxDraftAttempts: 2,
    commit: 'test',
  })
}

function objectArgs(): GenerateObjectArgs<unknown> {
  return {
    task: { name: 'proofread', input: {} },
    system: proofreadTask.system,
    prompt: '<manuscript>\nShe go.\n</manuscript>',
    schema: proofreadTask.schema,
    effort: 'medium',
    maxTokens: 16000,
  }
}

/** One streamed /api/chat answer as NDJSON lines. */
function ndjson(content: string, doneReason: 'stop' | 'length', evalCount: number): string {
  return [
    JSON.stringify({ message: { role: 'assistant', content }, done: false }),
    JSON.stringify({
      message: { role: 'assistant', content: '' },
      done: true,
      done_reason: doneReason,
      prompt_eval_count: 10,
      eval_count: evalCount,
    }),
  ].join('\n')
}

/** Starts a server that answers each /api/chat request with the next reply and records its body. */
async function startOllama(replies: string[]): Promise<Record<string, unknown>[]> {
  const bodies: Record<string, unknown>[] = []
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString()
    })
    req.on('end', () => {
      bodies.push(JSON.parse(raw) as Record<string, unknown>)
      res.writeHead(200, { 'content-type': 'application/x-ndjson' })
      res.end(replies.shift() ?? ndjson('{"suggestions":[]}', 'stop', 5))
    })
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()))
  const { port } = server.address() as AddressInfo
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`
  return bodies
}

describe('openRun retry client', () => {
  it('builds a retry client for a local profile', async () => {
    const dir = newDir()
    qwenRun(dir)
    const bodies = await startOllama([
      ndjson('{"sugg', 'length', 32000),
      ndjson('{"suggestions":[]}', 'stop', 5),
    ])
    ctx = await openRun(dir)
    const { client } = ctx

    await expect(client.generateObject(objectArgs())).rejects.toBeInstanceOf(AppError)
    client.takeLastFailure()
    client.beginRetry()
    await client.generateObject(objectArgs())
    client.endRetry()

    expect(bodies).toHaveLength(2)
    expect(bodies[0]?.think).toBe(true)
    expect((bodies[0]?.options as { num_predict: number }).num_predict).toBe(32000)
    expect(bodies[1]?.think).toBe(false)
    expect((bodies[1]?.options as { num_predict: number }).num_predict).toBe(48000)
    expect(client.records[1]?.retryBudget).toEqual({
      reason: 'max-tokens',
      maxTokens: 48000,
      think: false,
    })
  }, 60_000)

  it('has no retry client when a test inner is given', async () => {
    const dir = newDir()
    qwenRun(dir)
    const caps: number[] = []
    let calls = 0
    const inner: AiClient = {
      provider: 'test',
      defaultModel: 'm',
      async generateObject<T>(args: GenerateObjectArgs<T>) {
        caps.push(args.maxTokens)
        calls += 1
        if (calls === 1) {
          throw new AppError('AI_ERROR', MAX_TOKENS_MESSAGE, { usage: USAGE })
        }
        return { object: { suggestions: [] } as T, usage: USAGE, model: 'm' }
      },
      streamText(args: StreamTextArgs) {
        caps.push(args.maxTokens)
        const final = Promise.resolve({ text: '', usage: USAGE, model: 'm' })
        return { textStream: (async function* () {})(), final }
      },
    }
    ctx = await openRun(dir, { inner })
    const { client } = ctx

    await expect(client.generateObject(objectArgs())).rejects.toBeInstanceOf(AppError)
    client.takeLastFailure()
    client.beginRetry()
    await client.generateObject(objectArgs())
    client.endRetry()

    expect(caps).toEqual([32000, 48000])
    expect(client.records[1]?.thinkRequested).toBe(true)
    expect(client.records[1]?.retryBudget?.think).toBeNull()
  }, 60_000)
})
