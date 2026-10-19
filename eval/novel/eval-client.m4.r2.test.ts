import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { MODEL_PROFILES } from './models'
import { type CallRecord, EvalClient } from './eval-client'

// Task limits in the eval client (track M4): the task's own values next to the sent ones, and
// --product-limits. Kept apart from eval-client.test.ts (spec 5).

const QWEN = MODEL_PROFILES['qwen3.8-27b']
const CLOUD = MODEL_PROFILES['haiku-5.5']
const USAGE: AiUsage = { inputTokens: 10, outputTokens: 5 }

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-m4-'))
})

/** Inner client that records the args it receives and answers with fixed usage or an error. */
function spyClient(options: { error?: unknown } = {}) {
  const calls: { kind: 'object' | 'stream'; args: GenerateObjectArgs<unknown> | StreamTextArgs }[] =
    []
  const client: AiClient = {
    provider: 'spy',
    defaultModel: 'spy-model',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      calls.push({ kind: 'object', args })
      if (options.error !== undefined) throw options.error
      return { object: { ok: true } as T, usage: USAGE, model: 'spy-model' }
    },
    streamText(args: StreamTextArgs) {
      calls.push({ kind: 'stream', args })
      const final =
        options.error !== undefined
          ? Promise.reject(options.error)
          : Promise.resolve({ text: 'Hello', usage: USAGE, model: 'spy-model' })
      const textStream = (async function* () {
        yield 'Hello'
      })()
      return { textStream, final }
    },
  }
  return { client, calls }
}

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

function readRecord(file: string): CallRecord {
  return JSON.parse(readFileSync(join(callsDir, file), 'utf8')) as CallRecord
}

describe('EvalClient task limits (M4)', () => {
  it('records the task effort apart from the sent effort', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: CLOUD, lang: 'ko', callsDir })
    await client.generateObject(objectArgs('proofread', { effort: 'low' }))
    expect((spy.calls[0].args as GenerateObjectArgs<unknown>).effort).toBe('high')
    const record = readRecord('001-proofread.json')
    expect(record.taskEffort).toBe('low')
    expect(record.effortRequested).toBe('high')
  })

  it('records the task maxTokens apart from the sent maxTokens by default', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: CLOUD, lang: 'ko', callsDir })
    await client.generateObject(objectArgs('proofread', { maxTokens: 16000 }))
    expect((spy.calls[0].args as GenerateObjectArgs<unknown>).maxTokens).toBe(32000)
    const record = readRecord('001-proofread.json')
    expect(record.taskMaxTokens).toBe(16000)
    expect(record.maxTokens).toBe(32000)
    expect(record.maxTokensRule).toBe('floor')
  })

  it('keeps a task value above the floor', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: CLOUD, lang: 'ko', callsDir })
    await client.generateObject(objectArgs('proofread', { maxTokens: 40000 }))
    expect((spy.calls[0].args as GenerateObjectArgs<unknown>).maxTokens).toBe(40000)
    const record = readRecord('001-proofread.json')
    expect(record.taskMaxTokens).toBe(40000)
    expect(record.maxTokens).toBe(40000)
    expect(record.maxTokensRule).toBe('floor')
  })

  it.each([
    ['qwen', QWEN],
    ['haiku', CLOUD],
  ])('--product-limits sends the task maxTokens as is (%s)', async (_name, profile) => {
    const spy = spyClient()
    const client = new EvalClient({
      inner: spy.client,
      profile,
      lang: 'ko',
      callsDir,
      productLimits: true,
    })
    await client.generateObject(objectArgs('proofread', { maxTokens: 16000 }))
    expect((spy.calls[0].args as GenerateObjectArgs<unknown>).maxTokens).toBe(16000)
    const record = readRecord('001-proofread.json')
    expect(record.maxTokens).toBe(16000)
    expect(record.taskMaxTokens).toBe(16000)
    expect(record.maxTokensRule).toBe('product')
  })

  it('--product-limits leaves the effort alone', async () => {
    const spy = spyClient()
    const client = new EvalClient({
      inner: spy.client,
      profile: CLOUD,
      lang: 'ko',
      callsDir,
      productLimits: true,
    })
    await client.generateObject(objectArgs('proofread', { effort: 'low' }))
    expect((spy.calls[0].args as GenerateObjectArgs<unknown>).effort).toBe('high')
    const record = readRecord('001-proofread.json')
    expect(record.taskEffort).toBe('low')
    expect(record.effortRequested).toBe('high')
  })

  it('--product-limits applies to streams', async () => {
    const withOption = spyClient()
    const product = new EvalClient({
      inner: withOption.client,
      profile: CLOUD,
      lang: 'ko',
      callsDir,
      productLimits: true,
    })
    const streamArgs: StreamTextArgs = {
      task: { name: 'draft-chapter', input: {} },
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'high',
      maxTokens: 16000,
    }
    await product.streamText(streamArgs).final

    const withoutOption = spyClient()
    const floor = new EvalClient({
      inner: withoutOption.client,
      profile: CLOUD,
      lang: 'ko',
      callsDir: join(callsDir, 'floor'),
    })
    await floor.streamText(streamArgs).final

    expect((withOption.calls[0].args as StreamTextArgs).maxTokens).toBe(16000)
    expect((withoutOption.calls[0].args as StreamTextArgs).maxTokens).toBe(32000)
    const productRecord = readRecord('001-draft-chapter.json')
    expect(productRecord.maxTokensRule).toBe('product')
    const floorRecord = JSON.parse(
      readFileSync(join(callsDir, 'floor', '001-draft-chapter.json'), 'utf8'),
    ) as CallRecord
    expect(floorRecord.maxTokensRule).toBe('floor')
    expect(floorRecord.taskMaxTokens).toBe(16000)
  })

  it('records the task values on a failed call', async () => {
    const spy = spyClient({ error: new Error('boom') })
    const client = new EvalClient({ inner: spy.client, profile: CLOUD, lang: 'ko', callsDir })
    await expect(
      client.generateObject(objectArgs('proofread', { effort: 'low', maxTokens: 16000 })),
    ).rejects.toThrow('boom')
    const record = readRecord('001-proofread.json')
    expect(record.error).not.toBeNull()
    expect(record.taskEffort).toBe('low')
    expect(record.taskMaxTokens).toBe(16000)
    expect(record.maxTokensRule).toBe('floor')
  })

  it('the default request is unchanged', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'ko', callsDir })
    await client.generateObject(objectArgs('proofread', { maxTokens: 16000 }))
    const args = spy.calls[0].args as GenerateObjectArgs<unknown>
    expect(args).toMatchObject({ effort: 'max', model: QWEN.model, maxTokens: 32000 })
  })
})
