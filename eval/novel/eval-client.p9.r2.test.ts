import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { FORMAT_MESSAGE, MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import { proofreadTask } from '@/ai/tasks/proofread'
import { AI_TIMEOUT_MESSAGE } from '@/ai/types'
import type { AiClient, AiEffort, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { AppError } from '@/lib/errors'
import { MODEL_PROFILES } from './models'
import { type CallRecord, EvalClient } from './eval-client'

// Retry budget tests for the eval client (P9). Kept apart from eval-client.test.ts.

const QWEN = MODEL_PROFILES['qwen3.8-27b']
const GPT_OSS = MODEL_PROFILES['gpt-oss-20b']
const CLOUD = MODEL_PROFILES['haiku-5.5']
const FAKE = MODEL_PROFILES.fake
const USAGE: AiUsage = { inputTokens: 10, outputTokens: 5 }

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-p9-'))
})

type Logged = { client: string; task: AiTaskName; maxTokens: number; effort: AiEffort }

function objectArgs(
  task: AiTaskName,
  overrides: Partial<GenerateObjectArgs<unknown>> = {},
): GenerateObjectArgs<unknown> {
  return {
    task: { name: task, input: {} },
    system: proofreadTask.system,
    prompt: '<manuscript>\nShe go.\n</manuscript>',
    schema: proofreadTask.schema,
    effort: 'medium',
    maxTokens: 16000,
    ...overrides,
  }
}

function streamArgs(task: AiTaskName): StreamTextArgs {
  return {
    task: { name: task, input: {} },
    system: 'SYSTEM',
    prompt: 'PROMPT',
    effort: 'medium',
    maxTokens: 16000,
  }
}

/** Resolves to the error a promise rejects with. Fails the test if it resolves. */
async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the call to reject')
}

/** Reads a stream to its end and then awaits its final result. */
async function drainStream(client: EvalClient, args: StreamTextArgs): Promise<void> {
  const out = client.streamText(args)
  const pieces: string[] = []
  for await (const piece of out.textStream) pieces.push(piece)
  await out.final
}

/**
 * Inner client that answers from a script: 'ok' gives a result, an Error is thrown (object) or
 * rejects the final result (stream). Every call is logged with its cap and effort.
 */
function scripted(name: string, script: ('ok' | Error)[], log: Logged[]): AiClient {
  return {
    provider: name,
    defaultModel: 'm',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      log.push({
        client: name,
        task: args.task.name,
        maxTokens: args.maxTokens,
        effort: args.effort,
      })
      const next = script.shift() ?? 'ok'
      if (next instanceof Error) throw next
      return { object: { suggestions: [] } as T, usage: USAGE, model: 'm' }
    },
    streamText(args: StreamTextArgs) {
      log.push({
        client: name,
        task: args.task.name,
        maxTokens: args.maxTokens,
        effort: args.effort,
      })
      const next = script.shift() ?? 'ok'
      async function* pieces() {
        if (next === 'ok') yield 'hi'
      }
      const final =
        next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve({ text: 'hi', usage: USAGE, model: 'm' })
      final.catch(() => {})
      return { textStream: pieces(), final }
    },
  }
}

/** The failure a call ends with, taken and armed for the next repeat (what withModelRetry does). */
function retryOnce(client: EvalClient): void {
  client.takeLastFailure()
  client.beginRetry()
}

const cutOff = () =>
  new AppError('AI_ERROR', MAX_TOKENS_MESSAGE, {
    usage: { inputTokens: 1000, outputTokens: 32000 },
  })
const malformed = () => new AppError('AI_ERROR', FORMAT_MESSAGE)

function recordsOf(client: EvalClient): CallRecord[] {
  return client.records
}

describe('EvalClient retry budget', () => {
  it('repeats a cut-off local call with a wider cap', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [cutOff(), 'ok'], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))

    expect(log.map((l) => l.maxTokens)).toEqual([32000, 48000])
    const [first, second] = recordsOf(client)
    expect('retryBudget' in (first ?? {})).toBe(false)
    expect(second?.maxTokens).toBe(48000)
    expect(second?.retryBudget).toEqual({ reason: 'max-tokens', maxTokens: 48000, think: null })
    expect(second?.thinkRequested).toBe(true)
    expect(second?.taskMaxTokens).toBe(16000)
  })

  it('repeats a cut-off helper on the retry client with lower think', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [cutOff()], log),
      retryInner: scripted('retry', ['ok'], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))

    expect(log.map((l) => `${l.client}:${l.maxTokens}`)).toEqual(['main:32000', 'retry:48000'])
    const second = recordsOf(client)[1]
    expect(second?.retryBudget).toEqual({ reason: 'max-tokens', maxTokens: 48000, think: false })
    expect(second?.thinkRequested).toBe(false)
  })

  it('repeats a malformed helper answer with lower think and keeps the cap', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [malformed()], log),
      retryInner: scripted('retry', ['ok'], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))

    expect(log.map((l) => `${l.client}:${l.maxTokens}`)).toEqual(['main:32000', 'retry:32000'])
    const second = recordsOf(client)[1]
    expect(second?.retryBudget).toEqual({ reason: 'format', maxTokens: null, think: false })
    expect(second?.thinkRequested).toBe(false)
  })

  it('lowers gpt-oss think one level', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [malformed()], log),
      retryInner: scripted('retry', ['ok'], log),
      profile: GPT_OSS,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('reader-sim')))
    retryOnce(client)
    await client.generateObject(objectArgs('reader-sim'))

    expect(recordsOf(client)[1]?.thinkRequested).toBe('medium')
  })

  it('repeats a cut-off prose stream wider and keeps its think', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [cutOff(), 'ok'], log),
      retryInner: scripted('retry', [], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    expect(await thrownBy(drainStream(client, streamArgs('draft-chapter')))).toBeInstanceOf(
      AppError,
    )
    retryOnce(client)
    await drainStream(client, streamArgs('draft-chapter'))

    expect(log.map((l) => `${l.client}:${l.maxTokens}`)).toEqual(['main:32000', 'main:48000'])
    const second = recordsOf(client)[1]
    expect(second?.thinkRequested).toBe(true)
    expect(second?.retryBudget).toEqual({ reason: 'max-tokens', maxTokens: 48000, think: null })
  })

  it('repeats a malformed scene rewrite unchanged', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [malformed(), 'ok'], log),
      retryInner: scripted('retry', [], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('scene-rewrite')))
    retryOnce(client)
    await client.generateObject(objectArgs('scene-rewrite'))

    expect(log.map((l) => `${l.client}:${l.maxTokens}`)).toEqual(['main:32000', 'main:32000'])
    expect('retryBudget' in (recordsOf(client)[1] ?? {})).toBe(false)
  })

  it('changes only the failed task during the repeat', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [cutOff(), 'ok', 'ok'], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('continuity-check'))
    await client.generateObject(objectArgs('proofread'))

    const [, continuity, proofread] = recordsOf(client)
    expect(continuity?.task).toBe('continuity-check')
    expect(continuity?.maxTokens).toBe(32000)
    expect('retryBudget' in (continuity ?? {})).toBe(false)
    expect(proofread?.maxTokens).toBe(48000)
  })

  it('changes every call of the failed task until endRetry', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [cutOff(), 'ok', 'ok', 'ok'], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))
    await client.generateObject(objectArgs('proofread'))
    client.endRetry()
    await client.generateObject(objectArgs('proofread'))

    expect(log.map((l) => l.maxTokens)).toEqual([32000, 48000, 48000, 32000])
  })

  it('changes nothing when no one repeats the failed call', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [cutOff(), 'ok', cutOff(), 'ok'], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    client.takeLastFailure()
    await client.generateObject(objectArgs('proofread'))
    expect(log[1]?.maxTokens).toBe(32000)

    await thrownBy(client.generateObject(objectArgs('proofread')))
    client.takeLastFailure()
    client.takeLastFailure()
    client.beginRetry()
    await client.generateObject(objectArgs('proofread'))
    expect(log[3]?.maxTokens).toBe(32000)
    expect(recordsOf(client).some((r) => r.retryBudget !== undefined)).toBe(false)
  })

  it('blocks the widening after a context overflow and keeps the think change', async () => {
    const log: Logged[] = []
    const overflow = new AppError('AI_ERROR', MAX_TOKENS_MESSAGE, {
      usage: { inputTokens: 200000, outputTokens: 62144 },
    })
    const client = new EvalClient({
      inner: scripted('main', [overflow], log),
      retryInner: scripted('retry', ['ok'], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))

    expect(log.map((l) => `${l.client}:${l.maxTokens}`)).toEqual(['main:32000', 'retry:32000'])
    expect(recordsOf(client)[1]?.retryBudget).toEqual({
      reason: 'max-tokens',
      maxTokens: null,
      think: false,
    })
  })

  it.each([
    ['a timeout', new AppError('AI_ERROR', AI_TIMEOUT_MESSAGE)],
    ['a limit', new AppError('AI_LIMIT', 'limit')],
    ['a plain error', new Error('boom')],
  ])('arms nothing for %s', async (_label, error) => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [error, 'ok'], log),
      retryInner: scripted('retry', [], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))

    expect(log.map((l) => `${l.client}:${l.maxTokens}`)).toEqual(['main:32000', 'main:32000'])
    expect('retryBudget' in (recordsOf(client)[1] ?? {})).toBe(false)
  })

  it.each([
    ['haiku-5.5', CLOUD],
    ['fake', FAKE],
  ])('never changes a %s call', async (_id, profile) => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [cutOff(), 'ok'], log),
      retryInner: scripted('retry', ['ok'], log),
      profile,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))

    expect(log.map((l) => l.client)).toEqual(['main', 'main'])
    expect(log[1]?.maxTokens).toBe(log[0]?.maxTokens)
    expect(log[1]?.effort).toBe(log[0]?.effort)
    expect('retryBudget' in (recordsOf(client)[1] ?? {})).toBe(false)
  })

  it('does not widen with --product-limits', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [cutOff(), 'ok'], log),
      retryInner: scripted('retry', [], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      productLimits: true,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))

    expect(log.map((l) => `${l.client}:${l.maxTokens}`)).toEqual(['main:16000', 'main:16000'])
    expect('retryBudget' in (recordsOf(client)[1] ?? {})).toBe(false)
  })

  it('does not change think when helperThink is off', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [malformed(), 'ok'], log),
      retryInner: scripted('retry', [], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      helperThink: 'off',
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))

    expect(log.map((l) => l.client)).toEqual(['main', 'main'])
    expect('retryBudget' in (recordsOf(client)[1] ?? {})).toBe(false)
  })

  it('writes retryBudget into the call file', async () => {
    const log: Logged[] = []
    const client = new EvalClient({
      inner: scripted('main', [cutOff(), 'ok'], log),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs('proofread')))
    retryOnce(client)
    await client.generateObject(objectArgs('proofread'))

    const file = JSON.parse(
      readFileSync(join(callsDir, '002-proofread.json'), 'utf8'),
    ) as CallRecord
    expect(file.retryBudget).toEqual({ reason: 'max-tokens', maxTokens: 48000, think: null })
  })
})
