import { describe, expect, it } from 'vitest'
import type { AiClient, AiUsage, StreamTextArgs } from '@/ai/types'
import { probeBatch, probeCache } from './probe-gateway'

// Stub client: each streamText call reports the next usage from the list.
function stubClient(usages: AiUsage[]) {
  const seen: StreamTextArgs[] = []
  let index = 0
  const client: AiClient = {
    provider: 'stub',
    defaultModel: 'stub-model',
    async generateObject() {
      throw new Error('not used')
    },
    streamText(args: StreamTextArgs) {
      seen.push(args)
      const usage = usages[index] ?? { inputTokens: 0, outputTokens: 0 }
      index += 1
      const textStream = (async function* () {
        yield '2'
      })()
      return {
        textStream,
        final: Promise.resolve({ text: '2', usage, model: 'stub-model' }),
      }
    },
  }
  return { client, seen }
}

describe('probeCache', () => {
  it('reports a cache hit when a call after the first reads cached tokens', async () => {
    const { client } = stubClient([
      { inputTokens: 2100, outputTokens: 3, cacheWriteTokens: 2048 },
      { inputTokens: 2100, outputTokens: 3, cacheReadTokens: 1800 },
    ])
    const result = await probeCache(client, { model: 'stub-model', system: 'sys', repeats: 2 })
    expect(result.cacheHit).toBe(true)
    expect(result.calls).toHaveLength(2)
    expect(result.calls[1].usage.cacheReadTokens).toBe(1800)
  })

  it('reports no cache hit when every call reads zero cached tokens', async () => {
    const { client } = stubClient([
      { inputTokens: 2100, outputTokens: 3, cacheReadTokens: 0 },
      { inputTokens: 2100, outputTokens: 3, cacheReadTokens: 0 },
    ])
    const result = await probeCache(client, { model: 'stub-model', system: 'sys', repeats: 2 })
    expect(result.cacheHit).toBe(false)
  })

  it('sends the same probe request on every repeat', async () => {
    const { client, seen } = stubClient([
      { inputTokens: 1, outputTokens: 1 },
      { inputTokens: 1, outputTokens: 1 },
      { inputTokens: 1, outputTokens: 1 },
    ])
    await probeCache(client, { model: 'stub-model', system: 'sys', repeats: 3 })
    expect(seen).toHaveLength(3)
    for (const args of seen) {
      expect(args.task.name).toBe('draft-chapter')
      expect(args.prompt).toBe('한 문장으로만 답하세요: 1 더하기 1은?')
      expect(args.effort).toBe('low')
      expect(args.maxTokens).toBe(200)
      expect(args.system).toBe('sys')
      expect(args.model).toBe('stub-model')
    }
  })
})

describe('probeBatch', () => {
  it('records a 404 status and a network error as null status', async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/v1/messages/batches')) {
        return new Response('not found', { status: 404 })
      }
      throw new Error('network down')
    }) as typeof fetch
    const result = await probeBatch(fetchImpl, {
      urls: ['https://example.test/v1/messages/batches', 'https://example.test/batches'],
      apiKey: 'test-key',
    })
    expect(result).toEqual([
      { url: 'https://example.test/v1/messages/batches', status: 404, note: 'not found' },
      { url: 'https://example.test/batches', status: null, note: 'network down' },
    ])
    expect(calls).toHaveLength(2)
  })
})
