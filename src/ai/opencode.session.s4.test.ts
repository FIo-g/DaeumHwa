import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createOpencodeResponsesClient, createOpencodeSdk, OpencodeAiClient } from '@/ai/opencode'

// Stage 4 review: one OpenCode session per conversation (work), not one per process.

const OutputSchema = z.object({ answer: z.string() })

const ENV_KEYS = [
  'OPENCODE_API_KEY',
  'OPENCODE_BASE_URL',
  'OPENCODE_OPENAI_BASE_URL',
  'OPENCODE_API_FORMAT',
] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  process.env.OPENCODE_API_KEY = 'oc-test-key'
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

type Recorded = { url: string; headers: Headers; body: Record<string, unknown> }

function stubFetch(answers: 'anthropic' | 'responses') {
  const requests: Recorded[] = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    requests.push({ url, headers: new Headers(init?.headers), body })
    const json =
      answers === 'responses'
        ? {
            model: body.model,
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: '{"answer":"네"}', annotations: [] }],
              },
            ],
            usage: { input_tokens: 1, output_tokens: 2 },
          }
        : {
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: body.model,
            content: [{ type: 'text', text: '{"answer":"네"}', citations: null }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 2 },
          }
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requests }
}

const baseArgs = {
  system: '시스템',
  prompt: '질문',
  schema: OutputSchema,
  effort: 'low' as const,
  maxTokens: 500,
  task: { name: 'proofread' as const, input: {} },
}

function anthropicClient(fetchImpl: typeof fetch) {
  return new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')
}

function responsesClient(fetchImpl: typeof fetch) {
  return new OpencodeAiClient(
    createOpencodeSdk({ fetch: fetchImpl }),
    'gpt-6-luna',
    createOpencodeResponsesClient({ fetch: fetchImpl, defaultModel: 'gpt-6-luna' }),
  )
}

describe('OpenCode session per conversation (s4)', () => {
  it('sends a different session header for a different cache key', async () => {
    const { fetchImpl, requests } = stubFetch('anthropic')
    const client = anthropicClient(fetchImpl)

    await client.generateObject({ ...baseArgs, cacheKey: 'w111' })
    await client.generateObject({ ...baseArgs, cacheKey: 'w222' })

    expect(requests[0].headers.get('x-opencode-session')).toBe('daeumhwa-w111')
    expect(requests[1].headers.get('x-opencode-session')).toBe('daeumhwa-w222')
    expect(requests[0].headers.get('user-agent')).toBe('daeumhwa/0.1')
  })

  it('sends the same session header for the same cache key', async () => {
    const { fetchImpl, requests } = stubFetch('anthropic')
    const client = anthropicClient(fetchImpl)

    await client.generateObject({ ...baseArgs, cacheKey: 'wsame' })
    await client.generateObject({ ...baseArgs, cacheKey: 'wsame' })

    expect(requests[0].headers.get('x-opencode-session')).toBe('daeumhwa-wsame')
    expect(requests[1].headers.get('x-opencode-session')).toBe('daeumhwa-wsame')
  })

  it('keeps the per-process id for a call without a cache key', async () => {
    const { fetchImpl, requests } = stubFetch('anthropic')
    const client = anthropicClient(fetchImpl)

    await client.generateObject(baseArgs)
    await client.generateObject(baseArgs)

    const first = requests[0].headers.get('x-opencode-session')
    expect(first).toMatch(/^daeumhwa-[0-9a-f-]{36}$/)
    expect(requests[1].headers.get('x-opencode-session')).toBe(first)
  })

  it('sends the cache-key session on the Responses format too', async () => {
    const { fetchImpl, requests } = stubFetch('responses')
    const client = responsesClient(fetchImpl)

    await client.generateObject({ ...baseArgs, cacheKey: 'w333' })
    await client.generateObject({ ...baseArgs, cacheKey: 'w444' })

    expect(requests[0].headers.get('x-opencode-session')).toBe('daeumhwa-w333')
    expect(requests[1].headers.get('x-opencode-session')).toBe('daeumhwa-w444')
    expect(requests[0].headers.get('user-agent')).toBe('daeumhwa/0.1')
  })
})
