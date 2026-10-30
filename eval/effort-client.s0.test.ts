import { describe, expect, it } from 'vitest'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { z } from 'zod'
import { withEffort } from './effort-client'

// Spy client that records the args it receives and answers with fixed values.
function spyClient() {
  const seen: { kind: 'object' | 'stream'; args: unknown }[] = []
  const client: AiClient = {
    provider: 'spy',
    defaultModel: 'spy-model',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      seen.push({ kind: 'object', args })
      return {
        object: args.schema.parse({ ok: true }) as T,
        usage: { inputTokens: 1, outputTokens: 1 },
        model: 'spy-model',
      }
    },
    streamText(args: StreamTextArgs) {
      seen.push({ kind: 'stream', args })
      const textStream = (async function* () {
        yield 'a'
      })()
      return {
        textStream,
        final: Promise.resolve({
          text: 'a',
          usage: { inputTokens: 1, outputTokens: 1 },
          model: 'spy-model',
        }),
      }
    },
  }
  return { client, seen }
}

const TASK = { name: 'chapter-extract' as const, input: { chapter: 1 } }
const SCHEMA = z.object({ ok: z.boolean() })

describe('withEffort', () => {
  it('keeps provider and default model', () => {
    const { client } = spyClient()
    const wrapped = withEffort(client, 'high')
    expect(wrapped.provider).toBe('spy')
    expect(wrapped.defaultModel).toBe('spy-model')
  })

  it('replaces effort on generateObject and leaves every other arg identical', async () => {
    const { client, seen } = spyClient()
    const wrapped = withEffort(client, 'low')
    const args = {
      task: TASK,
      system: 'sys',
      prompt: 'prompt',
      schema: SCHEMA,
      effort: 'max' as const,
      maxTokens: 4000,
      model: 'm1',
      timeoutMs: 1000,
    }
    await wrapped.generateObject(args)
    expect(seen).toHaveLength(1)
    const received = seen[0]?.args as Record<string, unknown>
    expect(received.effort).toBe('low')
    expect({ ...received, effort: 'max' }).toEqual(args)
  })

  it('replaces effort on streamText and leaves every other arg identical', () => {
    const { client, seen } = spyClient()
    const wrapped = withEffort(client, 'high')
    const args = {
      task: TASK,
      system: 'sys',
      prompt: 'prompt',
      effort: 'medium' as const,
      maxTokens: 16000,
    }
    wrapped.streamText(args)
    expect(seen).toHaveLength(1)
    const received = seen[0]?.args as Record<string, unknown>
    expect(received.effort).toBe('high')
    expect({ ...received, effort: 'medium' }).toEqual(args)
  })
})
