import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OllamaHttpError } from '@/ai/ollama'
import { FORMAT_MESSAGE } from '@/ai/anthropic'
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

describe('EvalClient request shaping', () => {
  it('forces max effort, the profile model and the output-token floor', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    await client.generateObject(objectArgs({ maxTokens: 16000 }))
    await client.generateObject(objectArgs({ maxTokens: 40000 }))
    const [first, second] = spy.calls.map((c) => c.args as GenerateObjectArgs<unknown>)
    expect(first).toMatchObject({ effort: 'max', model: QWEN.model, maxTokens: 32000 })
    expect(second).toMatchObject({ effort: 'max', model: QWEN.model, maxTokens: 40000 })
  })

  it('en mode swaps the system prompt and translates the prompt', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'en', callsDir })
    await client.generateObject(objectArgs({ prompt: '<manuscript>\n주인공\n</manuscript>' }))
    const sent = spy.calls[0].args as GenerateObjectArgs<unknown>
    expect(sent.system).toBe(EN_SYSTEMS.proofread)
    expect(sent.prompt).toBe(translateScaffold('<manuscript>\n주인공\n</manuscript>'))
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

  it('classifies errors', () => {
    expect(classifyError({ status: 429 })).toBe('external-limit')
    expect(classifyError(new Error('usage limit reached'))).toBe('external-limit')
    expect(classifyError(new TypeError('fetch failed'))).toBe('external-network')
    expect(classifyError({ code: 'ECONNREFUSED' })).toBe('external-network')
    expect(classifyError(new OllamaHttpError(503))).toBe('external-network')
    expect(classifyError(new AppError('AI_ERROR', FORMAT_MESSAGE))).toBe('model')
    expect(classifyError(new AppError('AI_ERROR', AI_TIMEOUT_MESSAGE))).toBe('model')
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
})
