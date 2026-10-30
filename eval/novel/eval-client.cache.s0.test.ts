import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiClient } from '@/ai/types'
import { AppError } from '@/lib/errors'
import { MODEL_PROFILES } from './models'
import { type CallRecord, EvalClient } from './eval-client'

const CLOUD = MODEL_PROFILES['haiku-5.5']

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-cache-s0-'))
})

/** Inner client whose object call fails after the API billed cached input. */
function failingClient(): AiClient {
  return {
    provider: 'spy',
    defaultModel: 'spy-model',
    async generateObject(): Promise<never> {
      throw new AppError('AI_ERROR', 'x', {
        usage: { inputTokens: 3, outputTokens: 1, cacheReadTokens: 2 },
      })
    },
    streamText() {
      return {
        textStream: (async function* () {})(),
        final: Promise.reject(new Error('unused')),
      }
    },
  }
}

describe('EvalClient billed usage with cache tokens', () => {
  it('keeps cache reads on a failed call record', async () => {
    const client = new EvalClient({
      inner: failingClient(),
      profile: CLOUD,
      lang: 'ko',
      callsDir,
    })
    await expect(
      client.generateObject({
        task: { name: 'proofread', input: {} },
        system: proofreadTask.system,
        prompt: '<manuscript>\nShe go.\n</manuscript>',
        schema: proofreadTask.schema,
        effort: 'medium',
        maxTokens: 16000,
      }),
    ).rejects.toThrow()
    const record = JSON.parse(
      readFileSync(join(callsDir, '001-proofread.json'), 'utf8'),
    ) as CallRecord
    expect(record.usage).toEqual({ inputTokens: 3, outputTokens: 1, cacheReadTokens: 2 })
  })
})
