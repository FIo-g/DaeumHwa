import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createOpencodeSdk, OpencodeAiClient, OPENCODE_BASE_URL } from '@/ai/opencode'
import { AppError } from '@/lib/errors'

const OutputSchema = z.object({ answer: z.string(), score: z.number() })

const ENV_KEYS = ['OPENCODE_API_KEY', 'OPENCODE_BASE_URL'] as const
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

type StubResponse = { status: number; body?: unknown; sse?: string }

/** Fake fetch that serves queued responses and records every request. No network. */
function stubFetch(responses: StubResponse[]) {
  const requests: Recorded[] = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    requests.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    })
    const next: StubResponse = responses.shift() ?? {
      status: 500,
      body: { error: 'no stub left' },
    }
    if (next.sse !== undefined) {
      return new Response(next.sse, {
        status: next.status,
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requests }
}

/** Server-sent events for one streamed text answer. */
function sseText(text: string, model = 'claude-haiku-5-5'): string {
  const events: [string, unknown][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      },
    ],
    [
      'content_block_start',
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '', citations: null },
      },
    ],
    [
      'content_block_delta',
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 20 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ]
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

function message(text: string, model = 'claude-haiku-5-5') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  }
}

function outputConfigError() {
  return {
    status: 400,
    body: {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'output_config.format is not supported by this endpoint',
      },
    },
  }
}

const baseArgs = {
  system: '시스템 지시',
  prompt: '질문',
  schema: OutputSchema,
  effort: 'low' as const,
  maxTokens: 500,
  fake: () => ({ answer: '가짜', score: 0 }),
}

describe('createOpencodeSdk', () => {
  it('points at the OpenCode Go Anthropic endpoint with bearer auth and no x-api-key', () => {
    const sdk = createOpencodeSdk()
    expect(sdk.baseURL).toBe(OPENCODE_BASE_URL)
    expect(OPENCODE_BASE_URL).toBe('https://opencode.ai/inference/go/anthropic')
    expect(sdk.authToken).toBe('oc-test-key')
    expect(sdk.apiKey).toBeNull()
  })

  it('uses OPENCODE_BASE_URL when it is set', () => {
    process.env.OPENCODE_BASE_URL = 'https://gateway.example.test/anthropic'
    expect(createOpencodeSdk().baseURL).toBe('https://gateway.example.test/anthropic')
  })
})

describe('OpencodeAiClient request shape', () => {
  it('sends bearer auth, the session header, the User-Agent and no fallbacks', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 200, body: message('{"answer":"네","score":3}') },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')
    const result = await client.generateObject(baseArgs)

    expect(result.object).toEqual({ answer: '네', score: 3 })
    expect(result.model).toBe('claude-haiku-5-5')
    expect(client.provider).toBe('opencode')

    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request.url).toBe('https://opencode.ai/inference/go/anthropic/v1/messages')
    expect(request.headers.get('authorization')).toBe('Bearer oc-test-key')
    expect(request.headers.get('x-api-key')).toBeNull()
    expect(request.headers.get('user-agent')).toBe('daeumhwa/0.1')
    expect(request.headers.get('x-opencode-session')).toMatch(/^daeumhwa-/)
    expect(request.headers.get('anthropic-beta')).toBeNull()
    expect(request.body.model).toBe('claude-haiku-5-5')
    expect(request.body.max_tokens).toBe(500)
    expect(request.body).not.toHaveProperty('fallbacks')
    expect(request.body).not.toHaveProperty('temperature')
  })

  it('keeps the same session id across requests in one process', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 200, body: message('{"answer":"a","score":1}') },
      { status: 200, body: message('{"answer":"b","score":2}') },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')
    await client.generateObject(baseArgs)
    await client.generateObject(baseArgs)
    const first = requests[0].headers.get('x-opencode-session')
    expect(first).toBeTruthy()
    expect(requests[1].headers.get('x-opencode-session')).toBe(first)
  })

  it('never uses server-side fallback, even for an opus model name', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 200, body: message('{"answer":"네","score":3}', 'claude-opus-5-5') },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-opus-5-5')
    await client.generateObject(baseArgs)
    expect(requests[0].url).toBe('https://opencode.ai/inference/go/anthropic/v1/messages')
    expect(requests[0].headers.get('anthropic-beta')).toBeNull()
    expect(requests[0].body).not.toHaveProperty('fallbacks')
  })

  it('maps an authentication failure to the Korean AI_ERROR message', async () => {
    const { fetchImpl } = stubFetch([
      {
        status: 401,
        body: { type: 'error', error: { type: 'authentication_error', message: 'bad key' } },
      },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')
    const error = await client.generateObject(baseArgs).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'AI_ERROR' })
    expect((error as AppError).message).toContain('API 키')
  })
})

describe('OpencodeAiClient JSON-mode fallback', () => {
  it('retries once in JSON mode when the gateway rejects output_config, and remembers it', async () => {
    const { fetchImpl, requests } = stubFetch([
      outputConfigError(),
      { status: 200, body: message('설명입니다.\n```json\n{"answer":"네","score":3}\n```') },
      { status: 200, body: message('{"answer":"또","score":4}') },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')

    const first = await client.generateObject(baseArgs)
    expect(first.object).toEqual({ answer: '네', score: 3 })
    expect(first.usage).toEqual({ inputTokens: 10, outputTokens: 20 })

    // First attempt used structured output, the retry did not.
    expect(requests).toHaveLength(2)
    expect(requests[0].body).toHaveProperty('output_config')
    expect(requests[1].body).not.toHaveProperty('output_config')
    expect(requests[1].body).not.toHaveProperty('fallbacks')
    const retryPrompt = (requests[1].body.messages as { content: string }[])[0].content
    expect(retryPrompt).toContain('JSON Schema')
    expect(retryPrompt).toContain('"score"')
    expect(retryPrompt.startsWith('질문')).toBe(true)

    // The second call goes straight to JSON mode for this model.
    const second = await client.generateObject(baseArgs)
    expect(second.object).toEqual({ answer: '또', score: 4 })
    expect(requests).toHaveLength(3)
    expect(requests[2].body).not.toHaveProperty('output_config')
  })

  it('does not retry on a 400 that does not mention structured output', async () => {
    const { fetchImpl, requests } = stubFetch([
      {
        status: 400,
        body: {
          type: 'error',
          error: { type: 'invalid_request_error', message: 'max_tokens too big' },
        },
      },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')
    await expect(client.generateObject(baseArgs)).rejects.toMatchObject({ code: 'AI_ERROR' })
    expect(requests).toHaveLength(1)
  })

  it('throws AI_ERROR with the format message when the JSON-mode answer does not match the schema', async () => {
    const { fetchImpl } = stubFetch([
      outputConfigError(),
      { status: 200, body: message('{"answer":"네"}') },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')
    await expect(client.generateObject(baseArgs)).rejects.toMatchObject({
      code: 'AI_ERROR',
      message: 'AI 응답 형식이 올바르지 않습니다.',
    })
  })
})

describe('OpencodeAiClient gateway fallbacks', () => {
  it('falls back to JSON mode when the gateway answers with prose, and counts both billed attempts', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 200, body: message('Sure! here you go') },
      { status: 200, body: message('{"answer":"네","score":3}') },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')
    const result = await client.generateObject(baseArgs)

    expect(result.object).toEqual({ answer: '네', score: 3 })
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 40 })
    expect(requests).toHaveLength(2)
    expect(requests[0].body).toHaveProperty('output_config')
    expect(requests[1].body).not.toHaveProperty('output_config')
  })

  it('marks a model for JSON mode only after the JSON retry succeeds', async () => {
    const { fetchImpl, requests } = stubFetch([
      outputConfigError(),
      {
        status: 400,
        body: {
          type: 'error',
          error: { type: 'invalid_request_error', message: 'max_tokens too big' },
        },
      },
      { status: 200, body: message('{"answer":"네","score":3}') },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')

    await expect(client.generateObject(baseArgs)).rejects.toMatchObject({ code: 'AI_ERROR' })
    // The failed retry did not switch the model, so the next call tries structured output again.
    await client.generateObject(baseArgs)
    expect(requests).toHaveLength(3)
    expect(requests[2].body).toHaveProperty('output_config')
  })

  it('does not treat a 400 that only says "format" as an output_config rejection', async () => {
    const { fetchImpl, requests } = stubFetch([
      {
        status: 400,
        body: {
          type: 'error',
          error: { type: 'invalid_request_error', message: 'Invalid request format' },
        },
      },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')
    await expect(client.generateObject(baseArgs)).rejects.toMatchObject({ code: 'AI_ERROR' })
    expect(requests).toHaveLength(1)
  })

  it('starts qwen3.7-plus in JSON mode without sending output_config', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 200, body: message('{"answer":"네","score":3}', 'qwen3.7-plus') },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'qwen3.7-plus')
    const result = await client.generateObject(baseArgs)
    expect(result.object).toEqual({ answer: '네', score: 3 })
    expect(requests).toHaveLength(1)
    expect(requests[0].body).not.toHaveProperty('output_config')
  })

  it('retries a stream once without output_config when the gateway rejects it, and remembers it', async () => {
    const { fetchImpl, requests } = stubFetch([
      outputConfigError(),
      { status: 200, sse: sseText('첫 문단.') },
      { status: 200, sse: sseText('둘째 문단.') },
    ])
    const client = new OpencodeAiClient(createOpencodeSdk({ fetch: fetchImpl }), 'claude-haiku-5-5')
    const streamArgs = {
      system: '시스템',
      prompt: '초안',
      effort: 'high' as const,
      maxTokens: 500,
      fake: () => '',
    }

    const first = client.streamText(streamArgs)
    const chunks: string[] = []
    for await (const chunk of first.textStream) chunks.push(chunk)
    expect(chunks).toEqual(['첫 문단.'])
    expect((await first.final).text).toBe('첫 문단.')
    expect(requests).toHaveLength(2)
    expect(requests[0].body).toHaveProperty('output_config')
    expect(requests[1].body).not.toHaveProperty('output_config')

    const second = client.streamText(streamArgs)
    expect((await second.final).text).toBe('둘째 문단.')
    expect(requests).toHaveLength(3)
    expect(requests[2].body).not.toHaveProperty('output_config')
  })
})
