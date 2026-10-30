import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { MODEL_PROFILES } from './models'
import { type CallRecord, EvalClient } from './eval-client'

// --deploy-settings in the eval client (stage 0): the task's own effort and maxTokens are sent.
// Kept apart from eval-client.m4.r2.test.ts.

const CLOUD = MODEL_PROFILES['haiku-5.5']
const USAGE: AiUsage = { inputTokens: 10, outputTokens: 5 }

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-s0-'))
})

/** Inner client that records the args it receives and answers with fixed usage. */
function spyClient() {
  const calls: { kind: 'object' | 'stream'; args: GenerateObjectArgs<unknown> | StreamTextArgs }[] =
    []
  const client: AiClient = {
    provider: 'spy',
    defaultModel: 'spy-model',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      calls.push({ kind: 'object', args })
      return { object: { ok: true } as T, usage: USAGE, model: 'spy-model' }
    },
    streamText(args: StreamTextArgs) {
      calls.push({ kind: 'stream', args })
      const textStream = (async function* () {
        yield 'Hello'
      })()
      return {
        textStream,
        final: Promise.resolve({ text: 'Hello', usage: USAGE, model: 'spy-model' }),
      }
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
    maxTokens: 4000,
    ...overrides,
  }
}

function readRecord(file: string): CallRecord {
  return JSON.parse(readFileSync(join(callsDir, file), 'utf8')) as CallRecord
}

describe('EvalClient deploy settings (stage 0)', () => {
  it('sends the task effort and maxTokens to the inner client on an object call', async () => {
    const spy = spyClient()
    const client = new EvalClient({
      inner: spy.client,
      profile: CLOUD,
      lang: 'ko',
      callsDir,
      deploySettings: true,
    })
    await client.generateObject(objectArgs('proofread', { effort: 'medium', maxTokens: 4000 }))
    const sent = spy.calls[0].args as GenerateObjectArgs<unknown>
    expect(sent.effort).toBe('medium')
    expect(sent.maxTokens).toBe(4000)
    const record = readRecord('001-proofread.json')
    expect(record.effortRule).toBe('task')
    expect(record.maxTokensRule).toBe('product')
    expect(record.effortRequested).toBe('medium')
  })

  it('sends the task effort and maxTokens to the inner client on a stream call', async () => {
    const spy = spyClient()
    const client = new EvalClient({
      inner: spy.client,
      profile: CLOUD,
      lang: 'ko',
      callsDir,
      deploySettings: true,
    })
    const result = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: 'system',
      prompt: 'prompt',
      effort: 'high',
      maxTokens: 16000,
    })
    await result.final
    const sent = spy.calls[0].args as StreamTextArgs
    expect(sent.effort).toBe('high')
    expect(sent.maxTokens).toBe(16000)
    expect(readRecord('001-draft-chapter.json').effortRule).toBe('task')
  })

  it('keeps the profile effort and the profile floor without the option', async () => {
    const spy = spyClient()
    const client = new EvalClient({ inner: spy.client, profile: CLOUD, lang: 'ko', callsDir })
    await client.generateObject(objectArgs('proofread', { effort: 'medium', maxTokens: 4000 }))
    const sent = spy.calls[0].args as GenerateObjectArgs<unknown>
    expect(sent.effort).toBe(CLOUD.effort)
    expect(sent.maxTokens).toBe(Math.max(4000, CLOUD.maxTokensFloor))
    const record = readRecord('001-proofread.json')
    expect(record.effortRule).toBe('profile')
  })
})
