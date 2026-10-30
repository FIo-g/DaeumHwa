import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiClient, AiUsage, GenerateObjectArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { MODEL_PROFILES } from './models'
import { EvalClient } from './eval-client'

// Harness label for the reader-sim time limit (round 2 P7). Kept apart from the older eval-client tests.

const USAGE: AiUsage = { inputTokens: 10, outputTokens: 5 }

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-p7-'))
})

function objectArgs(task: AiTaskName): GenerateObjectArgs<unknown> {
  return {
    task: { name: task, input: {} },
    system: proofreadTask.system,
    prompt: '<manuscript>\nShe go.\n</manuscript>',
    schema: proofreadTask.schema,
    effort: 'medium',
    maxTokens: 16000,
  }
}

/** Inner client on a fake clock: each call takes 231,113 ms, the slowest saved cloud reader-sim call. */
function slowInner(provider: string, clock: { t: number }): AiClient {
  return {
    provider,
    defaultModel: 'inner-model',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      clock.t += 231_113
      return { object: {} as T, usage: USAGE, model: args.model ?? 'inner-model' }
    },
    streamText() {
      throw new Error('streamText is not used by this client')
    },
  }
}

describe('EvalClient reader-sim time label (round 2 P7)', () => {
  it('labels a cloud reader-sim call with the 270 s limit', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: slowInner('opencode', clock),
      profile: MODEL_PROFILES['luna-6'],
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    await client.generateObject(objectArgs('reader-sim'))
    const record = client.records[0]
    expect(record.productTimeoutMs).toBe(270_000)
    expect(record.wouldTimeOut).toBe(false)
  })

  it('leaves other cloud tasks at the default', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: slowInner('opencode', clock),
      profile: MODEL_PROFILES['luna-6'],
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    await client.generateObject(objectArgs('continuity-check'))
    const record = client.records[0]
    expect(record.productTimeoutMs).toBe(120_000)
    expect(record.wouldTimeOut).toBe(true)
  })

  it('keeps the default for a local reader-sim call', async () => {
    const clock = { t: 0 }
    const client = new EvalClient({
      inner: slowInner('ollama', clock),
      profile: MODEL_PROFILES['qwen3.8-27b'],
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    await client.generateObject(objectArgs('reader-sim'))
    const record = client.records[0]
    expect(record.productTimeoutMs).toBe(120_000)
    expect(record.wouldTimeOut).toBe(true)
  })
})
