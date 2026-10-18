import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Anthropic, {
  APIConnectionError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk'
import { z } from 'zod'
import { AnthropicAiClient, FORMAT_MESSAGE, MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import { OllamaAiClient, OllamaHttpError } from '@/ai/ollama'
import { ResponsesAiClient } from '@/ai/responses'
import {
  AI_TIMEOUT_MESSAGE,
  type AiClient,
  type AiUsage,
  type GenerateObjectArgs,
  type StreamTextArgs,
} from '@/ai/types'
import { AppError } from '@/lib/errors'
import { MODEL_PROFILES, type ModelProfile } from './models'
import { EvalClient, classifyError, type CallRecord } from './eval-client'
import { EN_SYSTEMS } from './localize/en-systems'
import { translateScaffold } from './localize/scaffold'
import { proofreadTask } from '@/ai/tasks/proofread'
import { DRAFT_SYSTEM } from '@/ai/tasks/draft-chapter'

// Inner client that records what it was asked and answers with fixed usage or an error.
function spyClient(options: { usage?: AiUsage; error?: unknown; chunks?: string[] } = {}) {
  const calls: { kind: 'object' | 'stream'; args: GenerateObjectArgs<unknown> | StreamTextArgs }[] =
    []
  const usage = options.usage ?? { inputTokens: 10, outputTokens: 5 }
  const client: AiClient = {
    provider: 'spy',
    defaultModel: 'spy-model',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      calls.push({ kind: 'object', args })
      if (options.error !== undefined) throw options.error
      return { object: { ok: true } as T, usage, model: 'spy-model' }
    },
    streamText(args: StreamTextArgs) {
      calls.push({ kind: 'stream', args })
      const chunks = options.chunks ?? ['Hello ', 'world']
      const error = options.error
      const textStream = (async function* () {
        for (const chunk of chunks) yield chunk
      })()
      const final =
        error !== undefined
          ? Promise.reject(error)
          : Promise.resolve({ text: chunks.join(''), usage, model: 'spy-model' })
      return { textStream, final }
    },
  }
  return { client, calls }
}

// Inner client whose calls fail with the queued errors, one per call, in call order.
function queueClient(errors: unknown[]): AiClient {
  const queue = [...errors]
  return {
    provider: 'queue',
    defaultModel: 'queue-model',
    async generateObject(): Promise<never> {
      // Yield once so parallel calls interleave the way the real clients do.
      await Promise.resolve()
      throw queue.shift()
    },
    streamText() {
      throw new Error('streamText is not used by this client')
    },
  }
}

const QWEN = MODEL_PROFILES['qwen3.8-27b']
const CLOUD = MODEL_PROFILES['haiku-5.5']

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-'))
})
afterEach(() => {
  vi.restoreAllMocks()
})

function objectArgs(
  overrides: Partial<GenerateObjectArgs<unknown>> = {},
): GenerateObjectArgs<unknown> {
  return {
    task: { name: 'proofread', input: { text: 'She go.' } },
    system: proofreadTask.system,
    prompt: '<manuscript>\nShe go.\n</manuscript>',
    schema: proofreadTask.schema,
    effort: 'medium',
    maxTokens: 16000,
    ...overrides,
  }
}

function readRecord(file: string): CallRecord {
  return JSON.parse(readFileSync(join(callsDir, file), 'utf8')) as CallRecord
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

describe('EvalClient request shaping', () => {
  it('uses the profile effort, the profile model and the output-token floor', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    await client.generateObject(objectArgs({ maxTokens: 16000 }))
    await client.generateObject(objectArgs({ maxTokens: 40000 }))
    const [first, second] = spy.calls.map((c) => c.args as GenerateObjectArgs<unknown>)
    expect(first).toMatchObject({ effort: 'max', model: QWEN.model, maxTokens: 32000 })
    expect(second).toMatchObject({ effort: 'max', model: QWEN.model, maxTokens: 40000 })
  })

  it('sends the profile effort, not max, to generateObject and streamText and records it', async () => {
    const spy = spyClient()
    const profile: ModelProfile = { ...QWEN, effort: 'high' }
    const client = new EvalClient({ inner: spy.client, profile, lang: 'ko', callsDir })
    await client.generateObject(objectArgs())
    expect(spy.calls[0].args).toMatchObject({ effort: 'high' })
    expect(readRecord('001-proofread.json').effortRequested).toBe('high')
    const { final } = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: DRAFT_SYSTEM,
      prompt: 'draft',
      effort: 'high',
      maxTokens: 16000,
    })
    await final
    expect(spy.calls[1].args).toMatchObject({ effort: 'high' })
    expect(readRecord('002-draft-chapter.json').effortRequested).toBe('high')
  })

  it('en mode swaps the system prompt and translates the prompt', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'en', callsDir })
    const prompt = '현재 회차: 3화\n열린 떡밥: (없음)'
    await client.generateObject(objectArgs({ prompt }))
    const sent = spy.calls[0].args as GenerateObjectArgs<unknown>
    expect(sent.system).toBe(EN_SYSTEMS.proofread)
    expect(sent.prompt).toBe('Current chapter: 3\nOpen threads: (none)')
    expect(sent.prompt).toBe(translateScaffold(prompt))
  })

  it('ko mode passes prompts through unchanged', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    const args = objectArgs({ prompt: '현재 회차: 3화' })
    await client.generateObject(args)
    const sent = spy.calls[0].args as GenerateObjectArgs<unknown>
    expect(sent.system).toBe(proofreadTask.system)
    expect(sent.prompt).toBe('현재 회차: 3화')
  })
})

describe('EvalClient call records', () => {
  it('writes one call record per call with the sequence number and task', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    await client.generateObject(objectArgs())
    const record = readRecord('001-proofread.json')
    expect(record).toMatchObject({
      seq: 1,
      task: 'proofread',
      kind: 'object',
      usage: { inputTokens: 10, outputTokens: 5 },
      error: null,
    })
    expect(record.durationMs).toBeGreaterThanOrEqual(0)
    expect(record.productTimeoutMs).toBe(120000)
    expect(client.nextSeq).toBe(2)
    expect(client.records).toHaveLength(1)
  })

  it('uses the stream timeout for draft-chapter streams', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    const { final } = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: DRAFT_SYSTEM,
      prompt: 'draft',
      effort: 'high',
      maxTokens: 16000,
    })
    await final
    expect(readRecord('001-draft-chapter.json').productTimeoutMs).toBe(280000)
  })

  it('continues numbering from startSeq', async () => {
    const spy = spyClient()
    const client = new EvalClient({
      inner: spy.client,
      profile: QWEN,
      lang: 'ko',
      callsDir,
      startSeq: 7,
    })
    expect(client.nextSeq).toBe(7)
    await client.generateObject(objectArgs())
    expect(existsSync(join(callsDir, '007-proofread.json'))).toBe(true)
  })

  it('counts Hangul left in en mode', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'en', callsDir })
    await client.generateObject(objectArgs({ prompt: '회차 메모' }))
    expect(readRecord('001-proofread.json').hangulLeft).toBe(4)
  })

  it('flags context overflow when the local context window is full', async () => {
    const spy = spyClient({ usage: { inputTokens: 990, outputTokens: 20 } })
    const profile: ModelProfile = { ...QWEN, ollama: { numCtx: 1000, think: false } }
    const client = new EvalClient({ inner: spy.client, profile, lang: 'ko', callsDir })
    await client.generateObject(objectArgs())
    expect(readRecord('001-proofread.json').contextOverflow).toBe(true)
  })

  it('never flags context overflow for cloud profiles', async () => {
    const spy = spyClient({ usage: { inputTokens: 990, outputTokens: 20 } })
    const client = new EvalClient({ inner: spy.client, profile: CLOUD, lang: 'ko', callsDir })
    await client.generateObject(objectArgs())
    expect(readRecord('001-proofread.json').contextOverflow).toBe(false)
  })
})

describe('EvalClient failures', () => {
  it('records and rethrows failures, and hands out the last one once', async () => {
    const error = { status: 429 }
    const spy = spyClient({ error })
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    await expect(client.generateObject(objectArgs())).rejects.toBe(error)
    const record = readRecord('001-proofread.json')
    expect(record.error).toMatchObject({ kind: 'external-limit', status: 429 })
    expect(record.output).toBeNull()
    expect(record.usage).toBeNull()
    expect(client.takeLastFailure()).toMatchObject({ kind: 'external-limit' })
    expect(client.takeLastFailure()).toBeNull()
  })

  it('keeps the most severe failure of parallel calls until it is taken', async () => {
    // A rate limit, then a cancelled sibling: the sibling must not overwrite the limit.
    const limit = { status: 429 }
    const cancelled = new AppError('CANCELLED', '취소했습니다.')
    const client = new EvalClient({
      inner: queueClient([limit, cancelled]),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    const results = await Promise.allSettled([
      client.generateObject(objectArgs()),
      client.generateObject(objectArgs()),
    ])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(client.takeLastFailure()).toMatchObject({ kind: 'external-limit', status: 429 })
    expect(client.takeLastFailure()).toBeNull()
  })

  it('prefers an external failure over a later model failure', async () => {
    const network = new AppError('AI_ERROR', 'AI 호출에 실패했습니다: HTTP 503')
    const format = new AppError('AI_ERROR', FORMAT_MESSAGE)
    const client = new EvalClient({
      inner: queueClient([network, format]),
      profile: QWEN,
      lang: 'ko',
      callsDir,
    })
    await Promise.allSettled([
      client.generateObject(objectArgs()),
      client.generateObject(objectArgs()),
    ])
    expect(client.takeLastFailure()).toMatchObject({ kind: 'external-network', status: 503 })
    expect(client.takeLastFailure()).toBeNull()
  })

  it('classifies errors', () => {
    expect(classifyError({ status: 429 })).toBe('external-limit')
    expect(classifyError(new Error('usage limit reached'))).toBe('external-limit')
    expect(classifyError(new TypeError('fetch failed'))).toBe('external-network')
    expect(classifyError({ code: 'ECONNREFUSED' })).toBe('external-network')
    expect(classifyError(new OllamaHttpError(503))).toBe('external-network')
    expect(classifyError(new AppError('AI_ERROR', FORMAT_MESSAGE))).toBe('model')
    expect(classifyError(new AppError('AI_ERROR', AI_TIMEOUT_MESSAGE))).toBe('model')
  })

  it('classifies a mid-stream server failure as external, and an untagged AI_ERROR as model', () => {
    const tagged = { failure: 'OLLAMA_STREAM' }
    expect(classifyError(new AppError('AI_ERROR', 'AI 호출에 실패했습니다: crash', tagged))).toBe(
      'external-network',
    )
    expect(classifyError(new AppError('AI_ERROR', 'AI 응답이 중간에 끊겼습니다.', tagged))).toBe(
      'external-network',
    )
    expect(classifyError(new AppError('AI_ERROR', 'AI 호출에 실패했습니다: crash'))).toBe('model')
  })
})

describe('classifyError on configuration failures', () => {
  it('treats auth, payment and missing-model statuses as external, not model', () => {
    for (const status of [401, 402, 403, 404]) {
      expect(classifyError({ status })).toBe('external-network')
      expect(
        classifyError(new AppError('AI_ERROR', `AI 호출에 실패했습니다: HTTP ${status}`)),
      ).toBe('external-network')
    }
  })

  it('treats the wording of a bad key or a missing model as external', () => {
    expect(
      classifyError(new AppError('AI_ERROR', 'AI 호출에 실패했습니다: API 키가 올바르지 않습니다')),
    ).toBe('external-network')
    expect(classifyError(new Error('Invalid API key'))).toBe('external-network')
    expect(classifyError(new Error('authentication failed'))).toBe('external-network')
    expect(classifyError(new Error("model 'gpt-oss:20b' not found, try pulling it first"))).toBe(
      'external-network',
    )
  })

  it('keeps a format failure and a 400 as model failures', () => {
    expect(classifyError(new AppError('AI_ERROR', FORMAT_MESSAGE))).toBe('model')
    expect(classifyError({ status: 400 })).toBe('model')
  })

  it('classifies the real client shapes for a bad key, a payment error and a missing Ollama model', async () => {
    const args = {
      system: '시스템 지시',
      prompt: '질문',
      schema: z.object({ answer: z.string() }),
      effort: 'medium' as const,
      maxTokens: 1000,
      task: { name: 'proofread' as const, input: {} },
    }
    const rejected = new AuthenticationError(401, undefined, 'invalid x-api-key', new Headers())
    const failing = async (): Promise<never> => {
      throw rejected
    }
    const anthropic = {
      messages: { parse: failing, create: failing },
      beta: { messages: { parse: failing, stream: () => ({}) } },
    } as unknown as Anthropic
    const badKey = await thrownBy(
      new AnthropicAiClient(anthropic, 'claude-haiku-5-5').generateObject(args),
    )
    expect(classifyError(badKey)).toBe('external-network')

    for (const status of [402, 403]) {
      const gateway = new ResponsesAiClient({
        baseUrl: 'https://gateway.test/v1',
        apiKey: null,
        defaultModel: 'gateway-model',
        retryBaseDelayMs: 0,
        fetch: async () => new Response('{"error":{"message":"no"}}', { status }),
      })
      expect(classifyError(await thrownBy(gateway.generateObject(args)))).toBe('external-network')
    }

    const missing = new OllamaAiClient({
      model: 'gpt-oss:20b',
      numCtx: 1000,
      baseUrl: 'http://ollama.test',
      fetch: async () =>
        new Response(`{"error":"model 'gpt-oss:20b' not found, try pulling it first"}`, {
          status: 404,
        }),
    })
    const notFound = await thrownBy(missing.generateObject(args))
    expect(classifyError(notFound)).toBe('external-network')
    expect((notFound as Error).message).toContain('not found, try pulling it first')
  })
})

describe('classifyError on errors from the real inner clients', () => {
  const schema = z.object({ answer: z.string() })
  const baseArgs = {
    system: '시스템 지시',
    prompt: '질문',
    schema,
    effort: 'medium' as const,
    maxTokens: 1000,
    task: { name: 'proofread' as const, input: {} },
  }

  /** Anthropic stub whose parse and create calls either throw or return a fixed answer. */
  function anthropicWith(options: { error?: unknown; response?: unknown }): Anthropic {
    const answer = async () => {
      if (options.error !== undefined) throw options.error
      return options.response
    }
    return {
      messages: { parse: answer, create: answer },
      beta: { messages: { parse: answer, stream: () => ({}) } },
    } as unknown as Anthropic
  }

  it('Anthropic: a 429 and a 503 from the SDK', async () => {
    const rateLimited = new RateLimitError(429, undefined, 'rate limited', new Headers())
    const unavailable = new InternalServerError(503, undefined, 'unavailable', new Headers())
    const limitError = await thrownBy(
      new AnthropicAiClient(
        anthropicWith({ error: rateLimited }),
        'claude-haiku-5-5',
      ).generateObject(baseArgs),
    )
    const outageError = await thrownBy(
      new AnthropicAiClient(
        anthropicWith({ error: unavailable }),
        'claude-haiku-5-5',
      ).generateObject(baseArgs),
    )
    expect(limitError).toBeInstanceOf(AppError)
    expect(classifyError(limitError)).toBe('external-limit')
    expect(classifyError(outageError)).toBe('external-network')
  })

  it('Anthropic: a dropped connection is an external network failure', async () => {
    const dropped = new APIConnectionError({ message: 'Connection error.' })
    const error = await thrownBy(
      new AnthropicAiClient(anthropicWith({ error: dropped }), 'claude-haiku-5-5').generateObject(
        baseArgs,
      ),
    )
    expect(classifyError(error)).toBe('external-network')
  })

  it('Anthropic: a max-tokens stop stays a model failure', async () => {
    const response = {
      parsed_output: null,
      stop_reason: 'max_tokens',
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude-haiku-5-5',
      content: [],
    }
    const error = await thrownBy(
      new AnthropicAiClient(anthropicWith({ response }), 'claude-haiku-5-5').generateObject(
        baseArgs,
      ),
    )
    expect(error).toMatchObject({ message: MAX_TOKENS_MESSAGE })
    expect(classifyError(error)).toBe('model')
  })

  it('Responses gateway: a 429 and a 503 answer', async () => {
    const respond = (status: number) =>
      new ResponsesAiClient({
        baseUrl: 'https://gateway.test/v1',
        apiKey: null,
        defaultModel: 'gateway-model',
        retryBaseDelayMs: 0,
        fetch: async () => new Response('{"error":{"message":"slow down"}}', { status }),
      })
    const limitError = await thrownBy(respond(429).generateObject(baseArgs))
    const outageError = await thrownBy(respond(503).generateObject(baseArgs))
    expect(classifyError(limitError)).toBe('external-limit')
    expect(classifyError(outageError)).toBe('external-network')
  })

  it('Ollama: a refused or dropped connection is an external network failure', async () => {
    const client = new OllamaAiClient({
      model: 'qwen-test',
      numCtx: 1000,
      baseUrl: 'http://ollama.test',
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    const error = await thrownBy(client.generateObject(baseArgs))
    expect(classifyError(error)).toBe('external-network')
  })

  it('Ollama: an error line mid-stream is an external network failure', async () => {
    const client = new OllamaAiClient({
      model: 'qwen-test',
      numCtx: 1000,
      baseUrl: 'http://ollama.test',
      fetch: async () =>
        new Response(`${JSON.stringify({ error: 'runner stopped' })}\n`, {
          headers: { 'content-type': 'application/x-ndjson' },
        }),
    })
    const error = await thrownBy(client.generateObject(baseArgs))
    expect(classifyError(error)).toBe('external-network')
  })

  it('Ollama: a stream that ends without done is an external network failure', async () => {
    const client = new OllamaAiClient({
      model: 'qwen-test',
      numCtx: 1000,
      baseUrl: 'http://ollama.test',
      fetch: async () =>
        new Response(
          `${JSON.stringify({ model: 'qwen-test', message: { role: 'assistant', content: '{' }, done: false })}\n`,
          { headers: { 'content-type': 'application/x-ndjson' } },
        ),
    })
    const error = await thrownBy(client.generateObject(baseArgs))
    expect(classifyError(error)).toBe('external-network')
  })

  it('Ollama: HTTP 429 is a limit and HTTP 503 a network failure', async () => {
    const respond = (status: number) =>
      new OllamaAiClient({
        model: 'qwen-test',
        numCtx: 1000,
        baseUrl: 'http://ollama.test',
        fetch: async () => new Response('busy', { status }),
      })
    const limitError = await thrownBy(respond(429).generateObject(baseArgs))
    const outageError = await thrownBy(respond(503).generateObject(baseArgs))
    expect(classifyError(limitError)).toBe('external-limit')
    expect(classifyError(outageError)).toBe('external-network')
  })

  it('keeps the usage a failed call billed, from its error details', async () => {
    const billed = new AppError('AI_ERROR', 'AI 호출에 실패했습니다: HTTP 500', {
      usage: { inputTokens: 1200, outputTokens: 32000 },
    })
    const client = new EvalClient({
      inner: queueClient([billed]),
      profile: CLOUD,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs()))
    expect(client.records[0]?.usage).toEqual({ inputTokens: 1200, outputTokens: 32000 })
    expect(client.records[0]?.error).toMatchObject({ kind: 'external-network' })
  })

  it('reports hangulLeft as null for Korean runs and as a count for English runs', async () => {
    const ko = new EvalClient({ inner: spyClient().client, profile: CLOUD, lang: 'ko', callsDir })
    await ko.generateObject(objectArgs())
    expect(ko.records[0]?.hangulLeft).toBeNull()

    const en = new EvalClient({ inner: spyClient().client, profile: CLOUD, lang: 'en', callsDir })
    await en.generateObject(objectArgs())
    expect(typeof en.records[0]?.hangulLeft).toBe('number')
  })

  it('records the real client failures with their kind', async () => {
    const client = new EvalClient({
      inner: new AnthropicAiClient(
        anthropicWith({ error: new RateLimitError(429, undefined, 'rate limited', new Headers()) }),
        'claude-haiku-5-5',
      ),
      profile: CLOUD,
      lang: 'ko',
      callsDir,
    })
    await thrownBy(client.generateObject(objectArgs()))
    const record = readRecord('001-proofread.json')
    expect(record.error).toMatchObject({ kind: 'external-limit' })
    expect(client.takeLastFailure()).toMatchObject({ kind: 'external-limit' })
  })
})

describe('EvalClient speed', () => {
  const OLLAMA_STATS = {
    task: 'proofread' as const,
    model: QWEN.model,
    promptTokens: 1000,
    promptMs: 2000,
    outputTokens: 300,
    evalMs: 10000,
    totalMs: 13000,
  }

  it('takes Ollama speed from the reported timings', async () => {
    const spy = spyClient({ usage: { inputTokens: 1000, outputTokens: 300 } })
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    client.onOllamaStats(OLLAMA_STATS)
    await client.generateObject(objectArgs())
    expect(readRecord('001-proofread.json').speed).toEqual({
      outputTokensPerSec: 30,
      promptTokensPerSec: 500,
      source: 'ollama',
    })
  })

  it('matches Ollama stats to the call by task name', async () => {
    const spy = spyClient({ usage: { inputTokens: 10, outputTokens: 200 } })
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    client.onOllamaStats({ ...OLLAMA_STATS, task: 'draft-chapter' })
    await client.generateObject(objectArgs())
    expect(readRecord('001-proofread.json').speed).toEqual({
      outputTokensPerSec: null,
      promptTokensPerSec: null,
      source: 'wall',
    })
  })

  it('uses wall-clock speed for object calls on other providers', async () => {
    const clock = { t: 0 }
    const inner: AiClient = {
      provider: 'spy',
      defaultModel: 'spy-model',
      async generateObject<T>(): Promise<{ object: T; usage: AiUsage; model: string }> {
        clock.t += 4000
        return {
          object: { ok: true } as T,
          usage: { inputTokens: 10, outputTokens: 200 },
          model: 'spy-model',
        }
      },
      streamText(): never {
        throw new Error('streamText is not used by this client')
      },
    }
    const client = new EvalClient({
      inner,
      profile: CLOUD,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    await client.generateObject(objectArgs())
    const record = readRecord('001-proofread.json')
    expect(record.firstTokenMs).toBeNull()
    expect(record.speed).toEqual({
      outputTokensPerSec: 50,
      promptTokensPerSec: null,
      source: 'wall',
    })
  })

  it('measures the first token and the generation time of a stream', async () => {
    const clock = { t: 0 }
    let resolveFinal!: (result: { text: string; usage: AiUsage; model: string }) => void
    const final = new Promise<{ text: string; usage: AiUsage; model: string }>((resolve) => {
      resolveFinal = resolve
    })
    const inner: AiClient = {
      provider: 'spy',
      defaultModel: 'spy-model',
      generateObject(): never {
        throw new Error('generateObject is not used by this client')
      },
      streamText() {
        const textStream = (async function* () {
          clock.t = 1000
          yield 'Hello'
          clock.t = 5000
          resolveFinal({
            text: 'Hello',
            usage: { inputTokens: 10, outputTokens: 400 },
            model: 'spy-model',
          })
        })()
        return { textStream, final }
      },
    }
    const client = new EvalClient({
      inner,
      profile: CLOUD,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    const stream = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: DRAFT_SYSTEM,
      prompt: 'draft',
      effort: 'high',
      maxTokens: 16000,
    })
    for await (const piece of stream.textStream) expect(piece).toBe('Hello')
    await stream.final

    const record = readRecord('001-draft-chapter.json')
    expect(record).toMatchObject({ firstTokenMs: 1000, durationMs: 5000 })
    expect(record.speed).toEqual({
      outputTokensPerSec: 100,
      promptTokensPerSec: null,
      source: 'wall',
    })
  })

  it('times a stream whose text the caller never reads', async () => {
    const clock = { t: 0 }
    let resolveFinal!: (result: { text: string; usage: AiUsage; model: string }) => void
    const final = new Promise<{ text: string; usage: AiUsage; model: string }>((resolve) => {
      resolveFinal = resolve
    })
    const inner: AiClient = {
      provider: 'spy',
      defaultModel: 'spy-model',
      generateObject(): never {
        throw new Error('generateObject is not used by this client')
      },
      streamText() {
        const textStream = (async function* () {
          clock.t = 1000
          yield 'Hello'
          clock.t = 5000
          resolveFinal({
            text: 'Hello',
            usage: { inputTokens: 10, outputTokens: 400 },
            model: 'spy-model',
          })
        })()
        return { textStream, final }
      },
    }
    const client = new EvalClient({
      inner,
      profile: CLOUD,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    const stream = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: DRAFT_SYSTEM,
      prompt: 'draft',
      effort: 'high',
      maxTokens: 16000,
    })
    await stream.final

    const record = readRecord('001-draft-chapter.json')
    expect(record).toMatchObject({ firstTokenMs: 1000, durationMs: 5000 })
    expect(record.speed).toEqual({
      outputTokensPerSec: 100,
      promptTokensPerSec: null,
      source: 'wall',
    })
  })

  it('still yields every chunk once when the caller reads after final settles', async () => {
    const spy = spyClient({ chunks: ['a', 'b', 'c'] })
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    const stream = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: DRAFT_SYSTEM,
      prompt: 'draft',
      effort: 'high',
      maxTokens: 16000,
    })
    await stream.final
    const chunks: string[] = []
    for await (const chunk of stream.textStream) chunks.push(chunk)
    expect(chunks).toEqual(['a', 'b', 'c'])
  })

  it('leaves speed null for failed calls', async () => {
    const spy = spyClient({ error: new Error('boom') })
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    client.onOllamaStats(OLLAMA_STATS)
    await thrownBy(client.generateObject(objectArgs()))
    const record = readRecord('001-proofread.json')
    expect(record.error).not.toBeNull()
    expect(record.speed).toMatchObject({ outputTokensPerSec: null, promptTokensPerSec: null })
  })

  it('records the step key set by the runner', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    client.setStep('ch2:proofread')
    await client.generateObject(objectArgs())
    expect(readRecord('001-proofread.json').step).toBe('ch2:proofread')
  })
})

describe('EvalClient streams', () => {
  it('passes chunks through and writes the record when final settles', async () => {
    const spy = spyClient({ chunks: ['Hello ', 'world'] })
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    const { textStream, final } = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: DRAFT_SYSTEM,
      prompt: 'draft',
      effort: 'high',
      maxTokens: 16000,
    })
    const chunks: string[] = []
    for await (const chunk of textStream) chunks.push(chunk)
    expect(chunks).toEqual(['Hello ', 'world'])
    const result = await final
    expect(result.text).toBe('Hello world')
    const record = readRecord('001-draft-chapter.json')
    expect(record).toMatchObject({ kind: 'stream', output: { text: 'Hello world' }, error: null })
  })

  it('records and rethrows a synchronous throw from the inner generateObject', async () => {
    const boom = { status: 503 }
    const inner: AiClient = {
      provider: 'sync-throw',
      defaultModel: 'sync-model',
      generateObject(): never {
        throw boom
      },
      streamText() {
        throw new Error('streamText is not used by this client')
      },
    }
    const client = new EvalClient({ inner, profile: QWEN, lang: 'ko', callsDir })
    await expect(client.generateObject(objectArgs())).rejects.toBe(boom)
    const record = readRecord('001-proofread.json')
    expect(record).toMatchObject({
      kind: 'object',
      error: { kind: 'external-network', status: 503 },
    })
    expect(client.nextSeq).toBe(2)
    expect(client.takeLastFailure()).toMatchObject({ kind: 'external-network' })
  })

  it('records and rethrows a synchronous throw from the inner streamText', () => {
    const boom = { status: 503 }
    const inner: AiClient = {
      provider: 'sync-throw',
      defaultModel: 'sync-model',
      async generateObject(): Promise<never> {
        throw new Error('unused')
      },
      streamText(): never {
        throw boom
      },
    }
    const client = new EvalClient({ inner, profile: QWEN, lang: 'ko', callsDir })
    expect(() =>
      client.streamText({
        task: { name: 'draft-chapter', input: {} },
        system: DRAFT_SYSTEM,
        prompt: 'draft',
        effort: 'high',
        maxTokens: 16000,
      }),
    ).toThrow(boom)
    const record = readRecord('001-draft-chapter.json')
    expect(record).toMatchObject({
      kind: 'stream',
      error: { kind: 'external-network', status: 503 },
    })
    expect(client.nextSeq).toBe(2)
    expect(client.takeLastFailure()).toMatchObject({ kind: 'external-network' })
  })
})
