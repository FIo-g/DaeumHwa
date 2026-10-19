import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { OllamaAttempt, OllamaCallStats } from '@/ai/ollama'
import type { AiTaskName } from '@/db/types'
import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { AppError } from '@/lib/errors'
import { MODEL_PROFILES } from './models'
import { type CallRecord, EvalClient } from './eval-client'

// Ollama attempt record and prompt-speed rules of the eval client (track M2). Copies the helpers
// of eval-client.F4.test.ts.

const QWEN = MODEL_PROFILES['qwen3.8-27b']
const CLOUD = MODEL_PROFILES['haiku-5.5']
const USAGE: AiUsage = { inputTokens: 10, outputTokens: 5 }

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-m2-'))
})

function objectArgs(
  task: AiTaskName = 'proofread',
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

function streamArgs(task: AiTaskName, prompt = 'PROMPT'): StreamTextArgs {
  return {
    task: { name: task, input: {} },
    system: 'SYSTEM',
    prompt,
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

function readRecord(file: string): CallRecord {
  return JSON.parse(readFileSync(join(callsDir, file), 'utf8')) as CallRecord
}

/** A full attempt record for the proofread task unless fields say otherwise. */
function attemptFor(fields: Partial<OllamaAttempt> = {}): OllamaAttempt {
  return {
    task: 'proofread',
    model: QWEN.model,
    attempt: 1,
    done: true,
    doneReason: 'stop',
    loadMs: null,
    promptEvalMs: null,
    evalMs: null,
    totalMs: 600,
    otherMs: null,
    promptEvalCount: null,
    evalCount: null,
    thinkingChunks: 0,
    thinkingChars: 0,
    ...fields,
  }
}

/** Ollama stats for one call; the prompt rate is 500 tokens per second unless overridden. */
function statsFor(fields: Partial<OllamaCallStats> = {}): OllamaCallStats {
  return {
    task: 'proofread',
    model: QWEN.model,
    promptTokens: 1000,
    promptMs: 2000,
    outputTokens: 300,
    evalMs: 10000,
    totalMs: 13000,
    ...fields,
  }
}

/**
 * Inner client that moves the clock forward by `ms` on each call, so the wall time of a call is
 * known. A failed object call throws `error`.
 */
function clockedClient(clock: { t: number }, ms: number, error?: unknown): AiClient {
  return {
    provider: 'clocked',
    defaultModel: 'clocked-model',
    async generateObject<T>() {
      clock.t += ms
      if (error !== undefined) throw error
      return { object: { suggestions: [] } as T, usage: USAGE, model: 'clocked-model' }
    },
    streamText() {
      clock.t += ms
      const textStream = (async function* () {
        yield 'Hello '
        yield 'world'
      })()
      return {
        textStream,
        final: Promise.resolve({ text: 'Hello world', usage: USAGE, model: 'clocked-model' }),
      }
    },
  }
}

describe('EvalClient Ollama attempts', () => {
  it('stores the attempts under ollama and computes unaccountedMs', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: clockedClient(clock, 1000),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    const attempt = attemptFor({ totalMs: 600 })
    client.onOllamaAttempt(attempt)
    await client.generateObject(objectArgs())
    expect(readRecord('001-proofread.json').ollama).toEqual({
      attempts: [attempt],
      unaccountedMs: 400,
      promptCacheSuspected: false,
    })
  })

  it('matches attempts to the call by task name', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: clockedClient(clock, 1000),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    client.onOllamaAttempt(attemptFor({ task: 'draft-chapter' }))
    await client.generateObject(objectArgs('proofread'))
    expect(readRecord('001-proofread.json')).not.toHaveProperty('ollama')
  })

  it('adds up several attempts', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: clockedClient(clock, 1000),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    client.onOllamaAttempt(attemptFor({ attempt: 1, totalMs: 300 }))
    client.onOllamaAttempt(attemptFor({ attempt: 2, totalMs: 200 }))
    await client.generateObject(objectArgs())
    const ollama = readRecord('001-proofread.json').ollama
    expect(ollama?.unaccountedMs).toBe(500)
    expect(ollama?.attempts).toHaveLength(2)
  })

  it('leaves unaccountedMs null when an attempt did not finish', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: clockedClient(clock, 1000),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    client.onOllamaAttempt(attemptFor({ done: false, doneReason: null, totalMs: null }))
    await client.generateObject(objectArgs())
    const ollama = readRecord('001-proofread.json').ollama
    expect(ollama?.attempts).toHaveLength(1)
    expect(ollama?.unaccountedMs).toBeNull()
  })

  it('keeps the attempts of a failed call', async () => {
    const clock = { t: 0 }
    const failure = new AppError('AI_ERROR', 'AI 호출에 실패했습니다: length')
    const client = new EvalClient({
      inner: clockedClient(clock, 1000, failure),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    client.onOllamaAttempt(attemptFor({ doneReason: 'length', totalMs: 900 }))
    await thrownBy(client.generateObject(objectArgs()))
    const record = readRecord('001-proofread.json')
    expect(record.error).not.toBeNull()
    expect(record.ollama?.attempts[0]?.doneReason).toBe('length')
    expect(record.ollama?.unaccountedMs).toBe(100)
  })

  it('has no ollama key on a cloud profile', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: clockedClient(clock, 1000),
      profile: CLOUD,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    await client.generateObject(objectArgs())
    expect(readRecord('001-proofread.json')).not.toHaveProperty('ollama')
  })

  it('leaves the prompt speed out when the rate is implausible', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: clockedClient(clock, 1000),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    client.onOllamaStats(statsFor({ promptTokens: 5860, promptMs: 716 }))
    client.onOllamaAttempt(attemptFor())
    await client.generateObject(objectArgs())
    const record = readRecord('001-proofread.json')
    expect(record.speed).toEqual({
      outputTokensPerSec: 30,
      promptTokensPerSec: null,
      source: 'ollama',
    })
    expect(record.ollama?.promptCacheSuspected).toBe(true)
  })

  it('keeps the prompt speed at exactly the ceiling', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: clockedClient(clock, 1000),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    client.onOllamaStats(statsFor({ promptTokens: 1000, promptMs: 200 }))
    client.onOllamaAttempt(attemptFor())
    await client.generateObject(objectArgs())
    const record = readRecord('001-proofread.json')
    expect(record.speed.promptTokensPerSec).toBe(5000)
    expect(record.ollama?.promptCacheSuspected).toBe(false)
  })

  it('leaves the prompt speed out for a prompt that was sent before', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: clockedClient(clock, 1000),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    const sendSame = async () => {
      client.onOllamaStats(statsFor())
      client.onOllamaAttempt(attemptFor())
      await client.generateObject(objectArgs())
    }
    await sendSame()
    await sendSame()
    client.onOllamaStats(statsFor())
    client.onOllamaAttempt(attemptFor())
    await client.generateObject(objectArgs('proofread', { prompt: 'A different prompt' }))

    const first = readRecord('001-proofread.json')
    expect(first.speed.promptTokensPerSec).toBe(500)
    expect(first.ollama?.promptCacheSuspected).toBe(false)

    const second = readRecord('002-proofread.json')
    expect(second.speed).toEqual({
      outputTokensPerSec: 30,
      promptTokensPerSec: null,
      source: 'ollama',
    })
    expect(second.ollama?.promptCacheSuspected).toBe(true)

    const third = readRecord('003-proofread.json')
    expect(third.speed.promptTokensPerSec).toBe(500)
    expect(third.ollama?.promptCacheSuspected).toBe(false)
  })

  it('applies the repeated prompt rule to streams', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: clockedClient(clock, 1000),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    for (let i = 0; i < 2; i++) {
      client.onOllamaStats(statsFor({ task: 'draft-chapter' }))
      client.onOllamaAttempt(attemptFor({ task: 'draft-chapter' }))
      await client.streamText(streamArgs('draft-chapter')).final
    }
    expect(readRecord('001-draft-chapter.json').speed.promptTokensPerSec).toBe(500)
    expect(readRecord('002-draft-chapter.json').speed.promptTokensPerSec).toBeNull()
  })
})
