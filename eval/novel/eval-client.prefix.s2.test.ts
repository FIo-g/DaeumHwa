import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiClient, GenerateObjectArgs } from '@/ai/types'
import { blindCallRecord } from './blind'
import { MODEL_PROFILES } from './models'
import { type CallRecord, EvalClient } from './eval-client'

const CLOUD = MODEL_PROFILES['haiku-5.5']

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-prefix-s2-'))
})

/** Inner client that keeps the arguments of each object call and answers with fixed output. */
function spyClient(seen: GenerateObjectArgs<unknown>[]): AiClient {
  return {
    provider: 'spy',
    defaultModel: 'spy-model',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      seen.push(args as GenerateObjectArgs<unknown>)
      return {
        object: { ok: true } as T,
        usage: { inputTokens: 1, outputTokens: 1 },
        model: 'spy-model',
      }
    },
    streamText() {
      return {
        textStream: (async function* () {})(),
        final: Promise.reject(new Error('unused')),
      }
    },
  }
}

function request(promptPrefix?: string[]): GenerateObjectArgs<unknown> {
  return {
    task: { name: 'proofread', input: {} },
    system: proofreadTask.system,
    prompt: '<manuscript>\nShe go.\n</manuscript>',
    promptPrefix,
    schema: proofreadTask.schema,
    effort: 'medium',
    maxTokens: 16000,
  } as GenerateObjectArgs<unknown>
}

describe('EvalClient prompt prefix', () => {
  it('translates a prefix block on an English run and records it', async () => {
    const seen: GenerateObjectArgs<unknown>[] = []
    const client = new EvalClient({
      inner: spyClient(seen),
      profile: CLOUD,
      lang: 'en',
      callsDir,
    })
    await client.generateObject(request(['작품 전체']))
    expect(seen[0].promptPrefix).toEqual(['whole work'])
    const record = JSON.parse(
      readFileSync(join(callsDir, '001-proofread.json'), 'utf8'),
    ) as CallRecord
    expect(record.promptPrefix).toEqual(['whole work'])
    expect(record.hangulLeft).toBe(0)
  })

  it('leaves promptPrefix out of the record when the call has none', async () => {
    const client = new EvalClient({
      inner: spyClient([]),
      profile: CLOUD,
      lang: 'ko',
      callsDir,
    })
    await client.generateObject(request())
    const record = JSON.parse(
      readFileSync(join(callsDir, '001-proofread.json'), 'utf8'),
    ) as CallRecord
    expect(record).not.toHaveProperty('promptPrefix')
  })

  it('does not copy promptPrefix into the blinded call record', async () => {
    const client = new EvalClient({
      inner: spyClient([]),
      profile: CLOUD,
      lang: 'ko',
      callsDir,
    })
    await client.generateObject(request(['<voices>\n인물 말투\n</voices>']))
    const record = JSON.parse(
      readFileSync(join(callsDir, '001-proofread.json'), 'utf8'),
    ) as CallRecord
    expect(record.promptPrefix).toEqual(['<voices>\n인물 말투\n</voices>'])
    expect(blindCallRecord(record)).not.toHaveProperty('promptPrefix')
  })
})
