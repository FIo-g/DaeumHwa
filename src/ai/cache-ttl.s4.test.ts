import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { systemBlocks, userContent } from '@/ai/anthropic'
import { ResponsesAiClient } from '@/ai/responses'

const TTL_ENV = 'AI_CACHE_TTL'
const RETENTION_ENV = 'AI_CACHE_RETENTION'

const savedTtl = process.env[TTL_ENV]
const savedRetention = process.env[RETENTION_ENV]

afterEach(() => {
  if (savedTtl === undefined) delete process.env[TTL_ENV]
  else process.env[TTL_ENV] = savedTtl
  if (savedRetention === undefined) delete process.env[RETENTION_ENV]
  else process.env[RETENTION_ENV] = savedRetention
})

const OutputSchema = z.object({ answer: z.string() })
const MODEL = 'muse-spark-1.3-contributor'

function completed() {
  return {
    id: 'resp_test',
    object: 'response',
    model: MODEL,
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: '{"answer":"네"}', annotations: [] }],
      },
    ],
    usage: { input_tokens: 12, output_tokens: 34 },
  }
}

function stubFetch(bodies: Record<string, unknown>[]) {
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
    return new Response(JSON.stringify(completed()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return fetchImpl
}

const objectArgs = {
  system: '시스템 지시',
  prompt: '질문',
  schema: OutputSchema,
  effort: 'low' as const,
  maxTokens: 500,
  task: { name: 'proofread' as const, input: {} },
}

describe('Anthropic AI_CACHE_TTL', () => {
  it('keeps the stage 3 body when unset', () => {
    delete process.env[TTL_ENV]
    expect(systemBlocks('시스템 지시')).toEqual([
      { type: 'text', text: '시스템 지시', cache_control: { type: 'ephemeral' } },
    ])
  })

  it('adds ttl 1h to every cache_control when 1h', () => {
    process.env[TTL_ENV] = '1h'
    expect(systemBlocks('시스템 지시')).toEqual([
      { type: 'text', text: '시스템 지시', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ])
    const content = userContent({ prompt: '질문', promptPrefix: ['앞부분'] })
    expect(content).toEqual([
      { type: 'text', text: '앞부분', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: '질문' },
    ])
  })

  it('keeps the stage 3 body for any other value', () => {
    process.env[TTL_ENV] = '30m'
    expect(systemBlocks('시스템 지시')).toEqual([
      { type: 'text', text: '시스템 지시', cache_control: { type: 'ephemeral' } },
    ])
    const content = userContent({ prompt: '질문', promptPrefix: ['앞부분'] }) as unknown[]
    expect(content[0]).toEqual({
      type: 'text',
      text: '앞부분',
      cache_control: { type: 'ephemeral' },
    })
  })
})

describe('Responses AI_CACHE_RETENTION', () => {
  it('sends no retention field when unset (stage 3 body)', async () => {
    delete process.env[RETENTION_ENV]
    const bodies: Record<string, unknown>[] = []
    const client = new ResponsesAiClient({
      baseUrl: 'https://gateway.test/v1',
      apiKey: 'oc-test-key',
      fetch: stubFetch(bodies),
      defaultModel: MODEL,
      retryBaseDelayMs: 0,
    })
    await client.generateObject(objectArgs)
    expect('prompt_cache_retention' in bodies[0]).toBe(false)
  })

  it('adds prompt_cache_retention 24h when 24h', async () => {
    process.env[RETENTION_ENV] = '24h'
    const bodies: Record<string, unknown>[] = []
    const client = new ResponsesAiClient({
      baseUrl: 'https://gateway.test/v1',
      apiKey: 'oc-test-key',
      fetch: stubFetch(bodies),
      defaultModel: MODEL,
      retryBaseDelayMs: 0,
    })
    await client.generateObject(objectArgs)
    expect(bodies[0].prompt_cache_retention).toBe('24h')
  })

  it('sends no retention field for any other value', async () => {
    process.env[RETENTION_ENV] = '1h'
    const bodies: Record<string, unknown>[] = []
    const client = new ResponsesAiClient({
      baseUrl: 'https://gateway.test/v1',
      apiKey: 'oc-test-key',
      fetch: stubFetch(bodies),
      defaultModel: MODEL,
      retryBaseDelayMs: 0,
    })
    await client.generateObject(objectArgs)
    expect('prompt_cache_retention' in bodies[0]).toBe(false)
  })
})
