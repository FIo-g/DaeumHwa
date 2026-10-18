import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AI_TIMEOUT_MESSAGE } from '@/ai/types'
import { AppError } from '@/lib/errors'
import {
  ResponsesAiClient,
  reasoningEffortFor,
  retryDelayMs,
  toStrictJsonSchema,
} from '@/ai/responses'

const OutputSchema = z.object({ answer: z.string(), score: z.number() })
const MODEL = 'muse-spark-1.3-contributor'

type Recorded = {
  url: string
  headers: Headers
  body: Record<string, unknown>
  signal: AbortSignal | undefined
}

type StubResponse = {
  status?: number
  body?: unknown
  /** Raw server-sent event chunks (already byte-split by the test). */
  stream?: Uint8Array[]
  /** Leaves the stream open after the chunks, and records the cancel in `cancelled`. */
  hold?: { cancelled: boolean }
  /** Makes fetch reject, like a network failure. */
  throws?: unknown
  /** Extra response headers, e.g. Retry-After. */
  headers?: Record<string, string>
}

/** Fake fetch that serves queued responses and records every request. No network. */
function stubFetch(responses: StubResponse[]) {
  const requests: Recorded[] = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    requests.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      signal: init?.signal ?? undefined,
    })
    const next: StubResponse = responses.shift() ?? { status: 500, body: { error: 'no stub' } }
    if (next.throws !== undefined) throw next.throws
    if (next.stream) {
      const chunks = next.stream
      const hold = next.hold
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk)
          if (!hold) controller.close()
        },
        cancel() {
          if (hold) hold.cancelled = true
        },
      })
      return new Response(stream, {
        status: next.status ?? 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json', ...next.headers },
    })
  }
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requests }
}

function makeClient(fetchImpl: typeof fetch) {
  return new ResponsesAiClient({
    baseUrl: 'https://gateway.test/v1',
    apiKey: 'oc-test-key',
    headers: { 'x-opencode-session': 'daeumhwa-test', 'User-Agent': 'daeumhwa/0.1' },
    fetch: fetchImpl,
    defaultModel: MODEL,
    retryBaseDelayMs: 0,
  })
}

/** A completed Responses API body: a reasoning item first, then the message. */
function completed(text: string, model = MODEL) {
  return {
    id: 'resp_test',
    object: 'response',
    model,
    status: 'completed',
    output: [
      { type: 'reasoning', id: 'rs_1', summary: [] },
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 12, output_tokens: 34 },
  }
}

function sseChunks(events: unknown[], splitBytes = 5): Uint8Array[] {
  const bytes = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
  )
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += splitBytes) chunks.push(bytes.slice(i, i + splitBytes))
  return chunks
}

const baseArgs = {
  system: '시스템 지시',
  prompt: '질문',
  schema: OutputSchema,
  effort: 'low' as const,
  maxTokens: 500,
  task: { name: 'proofread' as const, input: {} },
}

function inputText(body: Record<string, unknown>): string {
  const input = body.input as { content: { text: string }[] }[]
  return input[0].content[0].text
}

describe('ResponsesAiClient request shape', () => {
  it('posts to /responses with bearer auth, the session header and the User-Agent', async () => {
    const { fetchImpl, requests } = stubFetch([{ body: completed('{"answer":"네","score":3}') }])
    const client = makeClient(fetchImpl)
    const result = await client.generateObject(baseArgs)

    expect(result.object).toEqual({ answer: '네', score: 3 })
    expect(result.model).toBe(MODEL)
    expect(client.provider).toBe('opencode')
    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request.url).toBe('https://gateway.test/v1/responses')
    expect(request.headers.get('authorization')).toBe('Bearer oc-test-key')
    expect(request.headers.get('x-opencode-session')).toBe('daeumhwa-test')
    expect(request.headers.get('user-agent')).toBe('daeumhwa/0.1')
    expect(request.body).not.toHaveProperty('temperature')
  })

  it('sends instructions, a user input part, max_output_tokens, store false and a strict json_schema', async () => {
    const { fetchImpl, requests } = stubFetch([{ body: completed('{"answer":"네","score":3}') }])
    await makeClient(fetchImpl).generateObject(baseArgs)
    const body = requests[0].body

    expect(body.model).toBe(MODEL)
    expect(body.instructions).toBe('시스템 지시')
    expect(body.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: '질문' }] }])
    expect(body.max_output_tokens).toBe(500)
    expect(body.store).toBe(false)
    expect(body).not.toHaveProperty('stream')
    expect(body).not.toHaveProperty('temperature')

    const format = (body.text as { format: Record<string, unknown> }).format
    expect(format).toMatchObject({ type: 'json_schema', strict: true })
    expect(typeof format.name).toBe('string')
    expect(format.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['answer', 'score'],
    })
    expect(format.schema).not.toHaveProperty('$schema')
  })

  it.each([
    ['low', 'low'],
    ['medium', 'medium'],
    ['high', 'high'],
    ['xhigh', 'high'],
    ['max', 'high'],
  ] as const)('maps effort %s to reasoning effort %s', async (effort, expected) => {
    expect(reasoningEffortFor(effort)).toBe(expected)
    const { fetchImpl, requests } = stubFetch([{ body: completed('{"answer":"네","score":3}') }])
    await makeClient(fetchImpl).generateObject({ ...baseArgs, effort })
    expect(requests[0].body.reasoning).toEqual({ effort: expected })
  })
})

describe('toStrictJsonSchema', () => {
  it('makes every object closed with all keys required, recursively, and keeps nullable unions', () => {
    const schema = z.toJSONSchema(
      z.object({
        items: z.array(z.object({ name: z.string(), note: z.string().nullable() })),
        tag: z.string().optional(),
      }),
    )
    const strict = toStrictJsonSchema(schema) as {
      $schema?: unknown
      additionalProperties: unknown
      required: string[]
      properties: {
        items: { items: Record<string, unknown> & { properties: Record<string, unknown> } }
      }
    }

    expect(strict).not.toHaveProperty('$schema')
    expect(strict.additionalProperties).toBe(false)
    expect(strict.required).toEqual(['items', 'tag'])
    const item = strict.properties.items.items
    expect(item.additionalProperties).toBe(false)
    expect(item.required).toEqual(['name', 'note'])
    expect(JSON.stringify(item.properties.note)).toContain('"null"')
  })
})

describe('ResponsesAiClient response parsing', () => {
  it('parses the message text after a reasoning item and reports usage', async () => {
    const { fetchImpl } = stubFetch([{ body: completed('{"answer":"네","score":3}') }])
    const result = await makeClient(fetchImpl).generateObject(baseArgs)
    expect(result.object).toEqual({ answer: '네', score: 3 })
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 34 })
  })

  it('maps incomplete with max_output_tokens to the cut-off message and keeps billed usage', async () => {
    const { fetchImpl } = stubFetch([
      {
        body: {
          ...completed(''),
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
        },
      },
    ])
    const error = await makeClient(fetchImpl)
      .generateObject(baseArgs)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'AI_ERROR' })
    expect((error as AppError).message).toBe('AI 응답이 너무 길어 중간에 끊겼습니다.')
    expect((error as AppError).details).toEqual({ usage: { inputTokens: 12, outputTokens: 34 } })
  })

  it('maps a refusal content block to the refusal message', async () => {
    const { fetchImpl } = stubFetch([
      {
        body: {
          ...completed(''),
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'refusal', refusal: '할 수 없습니다' }],
            },
          ],
        },
      },
    ])
    await expect(makeClient(fetchImpl).generateObject(baseArgs)).rejects.toMatchObject({
      code: 'AI_ERROR',
      message: 'AI가 이 요청을 처리하지 않았습니다.',
    })
  })

  it('maps incomplete with content_filter to the refusal message', async () => {
    const { fetchImpl } = stubFetch([
      {
        body: {
          ...completed(''),
          status: 'incomplete',
          incomplete_details: { reason: 'content_filter' },
        },
      },
    ])
    await expect(makeClient(fetchImpl).generateObject(baseArgs)).rejects.toMatchObject({
      message: 'AI가 이 요청을 처리하지 않았습니다.',
    })
  })

  it('maps HTTP and network failures to the same Korean messages as the Anthropic client', async () => {
    // Retryable failures are queued twice: the first attempt plus one retry.
    const cases: [StubResponse[], string][] = [
      [[{ status: 401, body: { error: { message: 'bad key' } } }], 'API 키가 올바르지 않습니다'],
      [[{ status: 403, body: { error: { message: 'no' } } }], 'API 키가 올바르지 않습니다'],
      [retryable({ status: 429, body: { error: { message: 'slow' } } }), '요청이 너무 많습니다'],
      [retryable({ status: 500, body: { error: { message: 'boom' } } }), 'HTTP 500'],
      [retryable({ throws: new TypeError('fetch failed') }), 'fetch failed'],
    ]
    for (const [stubs, reason] of cases) {
      const { fetchImpl } = stubFetch(stubs)
      const error = await makeClient(fetchImpl)
        .generateObject(baseArgs)
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).message).toBe(`AI 호출에 실패했습니다: ${reason}`)
    }
  })
})

/** The same stub queued for the first attempt and the one retry. */
function retryable(stub: StubResponse): StubResponse[] {
  return [stub, stub]
}

describe('ResponsesAiClient transient retries', () => {
  it('retries a 429 once and returns the answer from the second attempt', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 429, body: { error: { message: 'slow' } } },
      { body: completed('{"answer":"네","score":2}') },
    ])
    const result = await makeClient(fetchImpl).generateObject(baseArgs)
    expect(requests).toHaveLength(2)
    expect(result.object).toEqual({ answer: '네', score: 2 })
  })

  it('retries a 502 once, then succeeds', async () => {
    const answer = '{"answer":"네","score":1}'
    const { fetchImpl, requests } = stubFetch([
      { status: 502, body: { error: { message: 'bad gateway' } } },
      { body: completed(answer) },
    ])
    const result = await makeClient(fetchImpl).generateObject(baseArgs)
    expect(result.object).toEqual({ answer: '네', score: 1 })
    expect(requests).toHaveLength(2)
  })

  it('retries a network failure once, then succeeds', async () => {
    const answer = '{"answer":"네","score":1}'
    const { fetchImpl, requests } = stubFetch([
      { throws: new TypeError('fetch failed') },
      { body: completed(answer) },
    ])
    const result = await makeClient(fetchImpl).generateObject(baseArgs)
    expect(result.object).toEqual({ answer: '네', score: 1 })
    expect(requests).toHaveLength(2)
  })

  it('gives up after one retry and keeps the first failure reason', async () => {
    const { fetchImpl, requests } = stubFetch(
      retryable({ status: 503, body: { error: { message: 'down' } } }),
    )
    const error = await makeClient(fetchImpl)
      .generateObject(baseArgs)
      .catch((e: unknown) => e)
    expect(requests).toHaveLength(2)
    expect((error as AppError).message).toBe('AI 호출에 실패했습니다: HTTP 503')
  })

  it('stops a Retry-After wait as soon as the caller cancels', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 429, headers: { 'retry-after': '10' }, body: { error: { message: 'slow' } } },
      { body: completed('{"answer":"네","score":1}') },
    ])
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 10)
    const started = Date.now()
    const error = await makeClient(fetchImpl)
      .generateObject({ ...baseArgs, signal: controller.signal })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'CANCELLED', message: '취소했습니다.' })
    expect(Date.now() - started).toBeLessThan(5000)
    expect(requests).toHaveLength(1)
  })

  it('does not retry a 401', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 401, body: { error: { message: 'bad key' } } },
    ])
    await makeClient(fetchImpl)
      .generateObject(baseArgs)
      .catch(() => undefined)
    expect(requests).toHaveLength(1)
  })

  it('sends an abort signal with every attempt so a stalled gateway cannot hang the call', async () => {
    const { fetchImpl, requests } = stubFetch([{ body: completed('{"answer":"네","score":1}') }])
    await makeClient(fetchImpl).generateObject(baseArgs)
    expect(requests[0].signal).toBeInstanceOf(AbortSignal)
  })

  it('reads Retry-After seconds, falls back to backoff, and caps long waits', () => {
    const withRetryAfter = (value: string) =>
      new Response(null, { headers: { 'retry-after': value } })
    expect(retryDelayMs(withRetryAfter('2'), 0, 500)).toBe(2000)
    expect(retryDelayMs(withRetryAfter('999'), 0, 500)).toBe(20_000)
    expect(retryDelayMs(undefined, 0, 500)).toBe(500)
    expect(retryDelayMs(undefined, 1, 500)).toBe(1000)
  })
})

describe('ResponsesAiClient JSON-mode fallback', () => {
  it('stops retrying when the caller deadline passes during the retry wait', async () => {
    const { fetchImpl, requests } = stubFetch(
      retryable({ status: 503, body: { error: { message: 'down' } } }),
    )
    const client = new ResponsesAiClient({
      baseUrl: 'https://gateway.test/v1',
      apiKey: 'oc-test-key',
      fetch: fetchImpl,
      defaultModel: MODEL,
      retryBaseDelayMs: 500,
    })
    const error = await client
      .generateObject({ ...baseArgs, signal: AbortSignal.timeout(30) })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(requests).toHaveLength(1)
  })

  it('retries once in JSON mode when text.format is rejected, and remembers it for the model', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 400, body: { error: { message: 'Unsupported parameter: text.format' } } },
      { body: completed('설명입니다.\n```json\n{"answer":"네","score":3}\n```') },
      { body: completed('{"answer":"또","score":4}') },
    ])
    const client = makeClient(fetchImpl)

    const first = await client.generateObject(baseArgs)
    expect(first.object).toEqual({ answer: '네', score: 3 })
    // A 400 is not billed, so only the JSON-mode answer counts.
    expect(first.usage).toEqual({ inputTokens: 12, outputTokens: 34 })
    expect(requests).toHaveLength(2)
    expect(requests[0].body).toHaveProperty('text')
    expect(requests[1].body).not.toHaveProperty('text')
    expect(inputText(requests[1].body)).toContain('JSON Schema')
    expect(inputText(requests[1].body).startsWith('질문')).toBe(true)

    const second = await client.generateObject(baseArgs)
    expect(second.object).toEqual({ answer: '또', score: 4 })
    expect(requests).toHaveLength(3)
    expect(requests[2].body).not.toHaveProperty('text')
  })

  it('does not treat a generic 400 as a format rejection', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 400, body: { error: { message: 'Invalid request format' } } },
    ])
    await expect(makeClient(fetchImpl).generateObject(baseArgs)).rejects.toMatchObject({
      code: 'AI_ERROR',
    })
    expect(requests).toHaveLength(1)
  })

  it('retries in JSON mode when the answer is prose, and counts both attempts', async () => {
    const { fetchImpl, requests } = stubFetch([
      { body: completed('Sure! here you go') },
      { body: completed('{"answer":"네","score":3}') },
    ])
    const result = await makeClient(fetchImpl).generateObject(baseArgs)
    expect(result.object).toEqual({ answer: '네', score: 3 })
    expect(result.usage).toEqual({ inputTokens: 24, outputTokens: 68 })
    expect(requests).toHaveLength(2)
    expect(requests[1].body).not.toHaveProperty('text')
  })

  it('throws the format message with billed usage when the JSON-mode answer is still invalid', async () => {
    const { fetchImpl } = stubFetch([
      { status: 400, body: { error: { message: 'Unsupported parameter: text.format' } } },
      { body: completed('안녕하세요') },
    ])
    const error = await makeClient(fetchImpl)
      .generateObject(baseArgs)
      .catch((e: unknown) => e)
    expect(error).toMatchObject({
      code: 'AI_ERROR',
      message: 'AI 응답 형식이 올바르지 않습니다.',
    })
    expect((error as AppError).details).toEqual({ usage: { inputTokens: 12, outputTokens: 34 } })
  })
})

describe('ResponsesAiClient reasoning fallback', () => {
  it('retries once without reasoning when reasoning is rejected, and remembers it', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 400, body: { error: { message: 'Unsupported parameter: reasoning.effort' } } },
      { body: completed('{"answer":"네","score":3}') },
      { body: completed('{"answer":"또","score":4}') },
    ])
    const client = makeClient(fetchImpl)
    const first = await client.generateObject({ ...baseArgs, effort: 'high' })
    expect(first.object).toEqual({ answer: '네', score: 3 })
    expect(requests[0].body).toHaveProperty('reasoning')
    expect(requests[1].body).not.toHaveProperty('reasoning')
    expect(requests[1].body).toHaveProperty('text')

    await client.generateObject({ ...baseArgs, effort: 'high' })
    expect(requests).toHaveLength(3)
    expect(requests[2].body).not.toHaveProperty('reasoning')
  })

  it('does not remember the reasoning change when the retry fails', async () => {
    const { fetchImpl, requests } = stubFetch([
      { status: 400, body: { error: { message: 'Unsupported parameter: reasoning.effort' } } },
      { status: 400, body: { error: { message: 'bad' } } },
      { body: completed('{"answer":"네","score":3}') },
    ])
    const client = makeClient(fetchImpl)
    await expect(client.generateObject(baseArgs)).rejects.toMatchObject({ code: 'AI_ERROR' })
    await client.generateObject(baseArgs)
    expect(requests[2].body).toHaveProperty('reasoning')
  })
})

describe('ResponsesAiClient streaming', () => {
  it('yields output_text deltas split across chunks and takes usage from response.completed', async () => {
    const events = [
      { type: 'response.created', response: { status: 'in_progress' } },
      { type: 'response.output_text.delta', delta: '안녕' },
      { type: 'response.output_text.delta', delta: '하세요' },
      {
        type: 'response.completed',
        response: {
          ...completed('안녕하세요'),
          usage: { input_tokens: 7, output_tokens: 9 },
        },
      },
    ]
    // 5-byte chunks cut through multi-byte Korean characters and through event lines.
    const { fetchImpl, requests } = stubFetch([{ stream: sseChunks(events, 5) }])
    const client = makeClient(fetchImpl)
    const result = client.streamText({
      system: '시스템',
      prompt: '초안',
      effort: 'medium',
      maxTokens: 500,
      task: { name: 'proofread' as const, input: {} },
    })
    const chunks: string[] = []
    for await (const chunk of result.textStream) chunks.push(chunk)

    expect(chunks).toEqual(['안녕', '하세요'])
    const final = await result.final
    expect(final.text).toBe('안녕하세요')
    expect(final.usage).toEqual({ inputTokens: 7, outputTokens: 9 })
    expect(final.model).toBe(MODEL)
    expect(requests[0].body.stream).toBe(true)
    expect(requests[0].body).not.toHaveProperty('text')
    expect(requests[0].body.reasoning).toEqual({ effort: 'medium' })
  })

  it('retries a stream once without reasoning when it is rejected, and remembers it', async () => {
    const events = [
      { type: 'response.output_text.delta', delta: '둘째.' },
      { type: 'response.completed', response: completed('둘째.') },
    ]
    const { fetchImpl, requests } = stubFetch([
      { status: 400, body: { error: { message: 'reasoning is not supported' } } },
      { stream: sseChunks(events) },
      { stream: sseChunks(events) },
    ])
    const client = makeClient(fetchImpl)
    const streamArgs = {
      system: '시스템',
      prompt: '초안',
      effort: 'high' as const,
      maxTokens: 500,
      task: { name: 'proofread' as const, input: {} },
    }
    const first = client.streamText(streamArgs)
    expect((await first.final).text).toBe('둘째.')
    expect(requests[0].body).toHaveProperty('reasoning')
    expect(requests[1].body).not.toHaveProperty('reasoning')

    const second = client.streamText(streamArgs)
    expect((await second.final).text).toBe('둘째.')
    expect(requests[2].body).not.toHaveProperty('reasoning')
  })

  it('rejects the final promise with the cut-off message when the stream ends incomplete', async () => {
    const events = [
      { type: 'response.output_text.delta', delta: '앞부분' },
      {
        type: 'response.incomplete',
        response: {
          ...completed('앞부분'),
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
        },
      },
    ]
    const { fetchImpl } = stubFetch([{ stream: sseChunks(events) }])
    const result = makeClient(fetchImpl).streamText({
      system: '시스템',
      prompt: '초안',
      effort: 'low',
      maxTokens: 500,
      task: { name: 'proofread' as const, input: {} },
    })
    await expect(result.final).rejects.toMatchObject({
      code: 'AI_ERROR',
      message: 'AI 응답이 너무 길어 중간에 끊겼습니다.',
    })
  })
})

describe('ResponsesAiClient stream cleanup', () => {
  it('cancels the HTTP body when the stream stops on an error event', async () => {
    const hold = { cancelled: false }
    const events = [
      { type: 'response.output_text.delta', delta: '앞' },
      { type: 'error', message: 'gateway hiccup' },
    ]
    // The stream stays open after the error event, like a gateway that keeps the socket.
    const { fetchImpl } = stubFetch([{ stream: sseChunks(events), hold }])
    const result = makeClient(fetchImpl).streamText({
      system: '시스템',
      prompt: '초안',
      effort: 'low',
      maxTokens: 500,
      task: { name: 'proofread' as const, input: {} },
    })
    await expect(result.final).rejects.toMatchObject({ code: 'AI_ERROR' })
    expect(hold.cancelled).toBe(true)
  })
})

/** Fetch that never answers; it rejects with the signal's reason once the signal aborts. */
function hangingFetch(): { fetchImpl: typeof fetch; signals: (AbortSignal | undefined)[] } {
  const signals: (AbortSignal | undefined)[] = []
  const fetchImpl = (_input: string | URL | Request, init?: RequestInit) => {
    signals.push(init?.signal ?? undefined)
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })
  }
  return { fetchImpl: fetchImpl as unknown as typeof fetch, signals }
}

describe('ResponsesAiClient cancel and timeout', () => {
  it('maps an abort from the caller to CANCELLED', async () => {
    const { fetchImpl } = hangingFetch()
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5)
    const error = await makeClient(fetchImpl)
      .generateObject({ ...baseArgs, signal: controller.signal })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'CANCELLED', message: '취소했습니다.' })
  })

  it('applies the timeout when no signal is given', async () => {
    const { fetchImpl } = hangingFetch()
    const client = new ResponsesAiClient({
      baseUrl: 'https://gateway.test/v1',
      apiKey: 'oc-test-key',
      fetch: fetchImpl,
      defaultModel: MODEL,
      retryBaseDelayMs: 0,
      timeoutMs: 20,
    })
    const error = await client.generateObject(baseArgs).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'AI_ERROR', message: AI_TIMEOUT_MESSAGE })
  })

  it('uses the per-call timeout over the client timeout', async () => {
    const { fetchImpl } = hangingFetch()
    const client = makeClient(fetchImpl)
    const error = await client
      .generateObject({ ...baseArgs, timeoutMs: 10 })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'AI_ERROR', message: AI_TIMEOUT_MESSAGE })
  })

  it('maps a stream aborted by the caller to CANCELLED', async () => {
    const { fetchImpl } = hangingFetch()
    const controller = new AbortController()
    const result = makeClient(fetchImpl).streamText({
      system: '시스템',
      prompt: '초안',
      effort: 'low',
      maxTokens: 500,
      task: { name: 'proofread' as const, input: {} },
      signal: controller.signal,
    })
    controller.abort()
    await expect(result.final).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
