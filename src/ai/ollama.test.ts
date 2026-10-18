import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { FORMAT_MESSAGE, MAX_TOKENS_MESSAGE, jsonInstruction } from '@/ai/anthropic'
import { AI_CANCELLED_MESSAGE, AI_TIMEOUT_MESSAGE } from '@/ai/types'
import { type OllamaCallStats, OllamaAiClient, OllamaHttpError, stripThink } from '@/ai/ollama'
import { AppError } from '@/lib/errors'

type Call = { url: string; body: Record<string, unknown>; signal: AbortSignal | null | undefined }

const schema = z.object({ a: z.string() })
const task = { name: 'proofread' as const, input: {} }
const MODEL = 'qwen3.5:9b'

/** Fetch stub that records each request and answers with the next queued response. */
function fakeFetch(replies: Response[]) {
  const calls: Call[] = []
  const fetchStub = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      signal: init?.signal,
    })
    const next = replies.shift()
    if (!next) throw new Error('no reply queued')
    return next
  }
  return { calls, fetch: fetchStub as typeof fetch }
}

/** One streamed answer: a single content chunk followed by the done chunk. */
function chatReply(content: string, extra: Record<string, unknown> = {}) {
  return ndjsonReply([
    { model: MODEL, message: { role: 'assistant', content }, done: false },
    {
      model: MODEL,
      message: { role: 'assistant', content: '' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 10,
      eval_count: 5,
      ...extra,
    },
  ])
}

function ndjsonReply(lines: Record<string, unknown>[]) {
  return new Response(lines.map((line) => JSON.stringify(line)).join('\n') + '\n', {
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

function client(fetchImpl: typeof fetch, think?: boolean | 'low' | 'medium' | 'high') {
  return new OllamaAiClient({
    model: MODEL,
    numCtx: 65536,
    temperature: 0.6,
    topP: 0.95,
    topK: 20,
    think,
    baseUrl: 'http://ollama.test',
    fetch: fetchImpl,
  })
}

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected rejection')
}

describe('OllamaAiClient.generateObject', () => {
  it('sends schema, options and think', async () => {
    const { calls, fetch } = fakeFetch([chatReply('{"a":"x"}')])
    const result = await client(fetch, true).generateObject({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://ollama.test/api/chat')
    const body = calls[0].body
    expect(body.stream).toBe(true)
    expect(body.format).toEqual(z.toJSONSchema(schema))
    expect(body.options).toEqual({
      num_ctx: 65536,
      temperature: 0.6,
      top_p: 0.95,
      top_k: 20,
      num_predict: 4000,
    })
    expect(body.think).toBe(true)
    expect(body.model).toBe(MODEL)
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYSTEM' },
      { role: 'user', content: 'PROMPT' },
    ])
    expect(result).toEqual({
      object: { a: 'x' },
      usage: { inputTokens: 10, outputTokens: 5 },
      model: MODEL,
    })
  })

  it('reads content split across NDJSON lines and network reads, skipping thinking', async () => {
    const lines = [
      {
        model: MODEL,
        message: { role: 'assistant', content: '', thinking: '생각 1' },
        done: false,
      },
      { model: MODEL, message: { role: 'assistant', content: '{"a":' }, done: false },
      {
        model: MODEL,
        message: { role: 'assistant', content: '', thinking: '생각 2' },
        done: false,
      },
      { model: MODEL, message: { role: 'assistant', content: '"x"}' }, done: false },
      {
        model: MODEL,
        message: { role: 'assistant', content: '' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 10,
        eval_count: 5,
      },
    ]
    // Cut the bytes at odd positions so lines arrive split across reads.
    const bytes = new TextEncoder().encode(lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
    const pieces: Uint8Array[] = []
    for (let i = 0; i < bytes.length; i += 7) pieces.push(bytes.slice(i, i + 7))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(piece)
        controller.close()
      },
    })
    const { calls, fetch } = fakeFetch([
      new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }),
    ])

    const result = await client(fetch, true).generateObject({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })

    expect(calls[0].body.stream).toBe(true)
    expect(result).toEqual({
      object: { a: 'x' },
      usage: { inputTokens: 10, outputTokens: 5 },
      model: MODEL,
    })
  })

  it('fails with AI_ERROR when the stream carries an error line', async () => {
    const { fetch } = fakeFetch([
      ndjsonReply([
        { model: MODEL, message: { role: 'assistant', content: '{"a":' }, done: false },
        { error: 'model runner stopped' },
      ]),
    ])
    const error = await catchError(
      client(fetch).generateObject({
        task,
        system: 'SYSTEM',
        prompt: 'PROMPT',
        schema,
        effort: 'low',
        maxTokens: 4000,
      }),
    )

    expect(error).toMatchObject({ code: 'AI_ERROR' })
    expect((error as Error).message).toContain('model runner stopped')
  })

  it('fails with AI_ERROR when the stream ends without a done chunk', async () => {
    const { fetch } = fakeFetch([
      ndjsonReply([
        { model: MODEL, message: { role: 'assistant', content: '{"a":"x"}' }, done: false },
      ]),
    ])
    const error = await catchError(
      client(fetch).generateObject({
        task,
        system: 'SYSTEM',
        prompt: 'PROMPT',
        schema,
        effort: 'low',
        maxTokens: 4000,
      }),
    )

    expect(error).toMatchObject({
      code: 'AI_ERROR',
      message: expect.stringContaining('중간에 끊겼습니다'),
    })
  })

  it('keeps the fetch cause code in the message when headers never arrive', async () => {
    const timeoutFetch = (async () => {
      throw new TypeError('fetch failed', {
        cause: { code: 'UND_ERR_HEADERS_TIMEOUT' },
      })
    }) as typeof fetch

    const error = await catchError(
      client(timeoutFetch).generateObject({
        task,
        system: 'SYSTEM',
        prompt: 'PROMPT',
        schema,
        effort: 'low',
        maxTokens: 4000,
      }),
    )

    expect(error).toMatchObject({ code: 'AI_ERROR' })
    expect((error as Error).message).toContain('UND_ERR_HEADERS_TIMEOUT')
  })

  it('retries once with a JSON instruction', async () => {
    const { calls, fetch } = fakeFetch([chatReply('not json'), chatReply('{"a":"x"}')])
    const result = await client(fetch).generateObject({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })

    expect(calls).toHaveLength(2)
    const retryMessages = calls[1].body.messages as { role: string; content: string }[]
    expect(retryMessages[1].content.endsWith(jsonInstruction(schema))).toBe(true)
    expect(result.object).toEqual({ a: 'x' })
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 })
  })

  it('fails with FORMAT_MESSAGE after the retry, carrying the summed usage', async () => {
    const { fetch } = fakeFetch([chatReply('not json'), chatReply('still not json')])
    const error = await catchError(
      client(fetch).generateObject({
        task,
        system: 'SYSTEM',
        prompt: 'PROMPT',
        schema,
        effort: 'low',
        maxTokens: 4000,
      }),
    )

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'AI_ERROR',
      message: FORMAT_MESSAGE,
      details: { usage: { inputTokens: 20, outputTokens: 10 } },
    })
  })

  it('stops with MAX_TOKENS_MESSAGE on a length stop without retrying', async () => {
    const { calls, fetch } = fakeFetch([chatReply('{"a":"x"', { done_reason: 'length' })])
    const error = await catchError(
      client(fetch).generateObject({
        task,
        system: 'SYSTEM',
        prompt: 'PROMPT',
        schema,
        effort: 'low',
        maxTokens: 4000,
      }),
    )

    expect(calls).toHaveLength(1)
    expect(error).toMatchObject({ code: 'AI_ERROR', message: MAX_TOKENS_MESSAGE })
  })

  it('strips think blocks before parsing', async () => {
    const { fetch } = fakeFetch([chatReply('<think>plan</think>\n{"a":"x"}')])
    const result = await client(fetch).generateObject({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })
    expect(result.object).toEqual({ a: 'x' })
  })

  it('maps an HTTP error status to OllamaHttpError', async () => {
    const { fetch } = fakeFetch([new Response('boom', { status: 500 })])
    const error = await catchError(
      client(fetch).generateObject({
        task,
        system: 'SYSTEM',
        prompt: 'PROMPT',
        schema,
        effort: 'low',
        maxTokens: 4000,
      }),
    )
    expect(error).toBeInstanceOf(OllamaHttpError)
    expect((error as OllamaHttpError).status).toBe(500)
  })

  it('passes the caller signal to fetch and maps an abort to CANCELLED', async () => {
    const controller = new AbortController()
    const calls: Call[] = []
    const abortingFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        signal: init?.signal,
      })
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }) as typeof fetch

    const error = await catchError(
      client(abortingFetch).generateObject({
        task,
        system: 'SYSTEM',
        prompt: 'PROMPT',
        schema,
        effort: 'low',
        maxTokens: 4000,
        signal: controller.signal,
      }),
    )

    expect(calls[0].signal).toBe(controller.signal)
    expect(error).toMatchObject({ code: 'CANCELLED', message: AI_CANCELLED_MESSAGE })
  })

  it('maps a fetch TimeoutError (real time limit) to AI_TIMEOUT_MESSAGE', async () => {
    const timeoutFetch = (async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }) as typeof fetch

    const error = await catchError(
      client(timeoutFetch).generateObject({
        task,
        system: 'SYSTEM',
        prompt: 'PROMPT',
        schema,
        effort: 'low',
        maxTokens: 4000,
        timeoutMs: 1000,
      }),
    )

    expect(error).toMatchObject({ code: 'AI_ERROR', message: AI_TIMEOUT_MESSAGE })
  })

  it('maps a caller abort on a call with a time limit to CANCELLED', async () => {
    const controller = new AbortController()
    const abortingFetch = (async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }) as typeof fetch

    const error = await catchError(
      client(abortingFetch).generateObject({
        task,
        system: 'SYSTEM',
        prompt: 'PROMPT',
        schema,
        effort: 'low',
        maxTokens: 4000,
        timeoutMs: 1000,
        signal: controller.signal,
      }),
    )

    expect(error).toMatchObject({ code: 'CANCELLED', message: AI_CANCELLED_MESSAGE })
  })
})

describe('OllamaAiClient.streamText', () => {
  it('streams content, not thinking', async () => {
    const { fetch, calls } = fakeFetch([
      ndjsonReply([
        {
          model: MODEL,
          message: { role: 'assistant', content: '', thinking: '생각 1' },
          done: false,
        },
        {
          model: MODEL,
          message: { role: 'assistant', content: '', thinking: '생각 2' },
          done: false,
        },
        { model: MODEL, message: { role: 'assistant', content: '가' }, done: false },
        { model: MODEL, message: { role: 'assistant', content: '나' }, done: false },
        {
          model: MODEL,
          message: { role: 'assistant', content: '' },
          done: true,
          prompt_eval_count: 7,
          eval_count: 3,
        },
      ]),
    ])
    const { textStream, final } = client(fetch, true).streamText({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'low',
      maxTokens: 4000,
    })

    const pieces: string[] = []
    for await (const piece of textStream) pieces.push(piece)

    expect(pieces.join('')).toBe('가나')
    expect(await final).toEqual({
      text: '가나',
      usage: { inputTokens: 7, outputTokens: 3 },
      model: MODEL,
    })
    expect(calls[0].body.stream).toBe(true)
    expect(calls[0].body.think).toBe(true)
  })

  it('does not yield a leading think block from streamed content', async () => {
    const { fetch } = fakeFetch([
      ndjsonReply([
        { model: MODEL, message: { role: 'assistant', content: '<think>pl' }, done: false },
        { model: MODEL, message: { role: 'assistant', content: 'an</think>' }, done: false },
        { model: MODEL, message: { role: 'assistant', content: '\n' }, done: false },
        { model: MODEL, message: { role: 'assistant', content: '가' }, done: false },
        {
          model: MODEL,
          message: { role: 'assistant', content: '' },
          done: true,
          prompt_eval_count: 1,
          eval_count: 1,
        },
      ]),
    ])
    const { textStream, final } = client(fetch).streamText({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'low',
      maxTokens: 4000,
    })

    const pieces: string[] = []
    for await (const piece of textStream) pieces.push(piece)

    expect(pieces.join('')).toBe('가')
    expect(pieces.join('')).not.toContain('plan')
    expect((await final).text).toBe('가')
  })

  it('rejects with AI_ERROR when the stream carries an error line mid-answer', async () => {
    const { fetch } = fakeFetch([
      ndjsonReply([
        { model: MODEL, message: { role: 'assistant', content: '가' }, done: false },
        { error: 'model runner stopped' },
      ]),
    ])
    const { final } = client(fetch).streamText({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'low',
      maxTokens: 4000,
    })

    await expect(final).rejects.toMatchObject({ code: 'AI_ERROR' })
    await expect(final).rejects.toThrow('model runner stopped')
  })

  it('rejects with AI_ERROR when the stream ends without a done chunk', async () => {
    const { fetch } = fakeFetch([
      ndjsonReply([{ model: MODEL, message: { role: 'assistant', content: '가' }, done: false }]),
    ])
    const { final } = client(fetch).streamText({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'low',
      maxTokens: 4000,
    })

    await expect(final).rejects.toMatchObject({ code: 'AI_ERROR' })
    await expect(final).rejects.toThrow('중간에 끊겼습니다')
  })
})

describe('OllamaAiClient speed stats', () => {
  function statsClient(fetchImpl: typeof fetch, onStats: (s: OllamaCallStats) => void) {
    return new OllamaAiClient({
      model: MODEL,
      numCtx: 65536,
      baseUrl: 'http://ollama.test',
      fetch: fetchImpl,
      onStats,
    })
  }

  const timings = {
    prompt_eval_count: 1000,
    prompt_eval_duration: 2e9,
    eval_count: 300,
    eval_duration: 10e9,
    total_duration: 13e9,
  }

  it('reports the timings in ms once per attempt', async () => {
    const stats: OllamaCallStats[] = []
    const { fetch } = fakeFetch([chatReply('{"a":"x"}', timings)])
    await statsClient(fetch, (s) => stats.push(s)).generateObject({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })

    expect(stats).toEqual([
      {
        task: 'proofread',
        model: MODEL,
        promptTokens: 1000,
        promptMs: 2000,
        outputTokens: 300,
        evalMs: 10000,
        totalMs: 13000,
      },
    ])
  })

  it('reports stats twice when the structured call retries with the JSON instruction', async () => {
    const stats: OllamaCallStats[] = []
    const { fetch } = fakeFetch([chatReply('not json', timings), chatReply('{"a":"x"}', timings)])
    await statsClient(fetch, (s) => stats.push(s)).generateObject({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })

    expect(stats).toHaveLength(2)
    expect(stats.map((s) => s.outputTokens)).toEqual([300, 300])
  })

  it('reports zero for missing timing fields', async () => {
    const stats: OllamaCallStats[] = []
    const { fetch } = fakeFetch([chatReply('{"a":"x"}')])
    await statsClient(fetch, (s) => stats.push(s)).generateObject({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })

    expect(stats).toEqual([
      {
        task: 'proofread',
        model: MODEL,
        promptTokens: 10,
        promptMs: 0,
        outputTokens: 5,
        evalMs: 0,
        totalMs: 0,
      },
    ])
  })

  it('reports stream stats once from the final done chunk', async () => {
    const stats: OllamaCallStats[] = []
    const { fetch } = fakeFetch([
      ndjsonReply([
        { model: MODEL, message: { role: 'assistant', content: '가' }, done: false },
        {
          model: MODEL,
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 7,
          prompt_eval_duration: 1e9,
          eval_count: 3,
          eval_duration: 5e8,
          total_duration: 2e9,
        },
      ]),
    ])
    const { textStream, final } = statsClient(fetch, (s) => stats.push(s)).streamText({
      task,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'low',
      maxTokens: 4000,
    })
    const pieces: string[] = []
    for await (const piece of textStream) pieces.push(piece)
    await final

    expect(pieces.join('')).toBe('가')
    expect(stats).toEqual([
      {
        task: 'proofread',
        model: MODEL,
        promptTokens: 7,
        promptMs: 1000,
        outputTokens: 3,
        evalMs: 500,
        totalMs: 2000,
      },
    ])
  })
})

describe('stripThink', () => {
  it('removes a leading think block and the whitespace after it', () => {
    expect(stripThink('<think>a</think>본문')).toBe('본문')
    expect(stripThink('<think>a</think>\n\n본문')).toBe('본문')
  })

  it('leaves text without a think block unchanged', () => {
    expect(stripThink('본문 <think>x</think>')).toBe('본문 <think>x</think>')
    expect(stripThink('평범한 문장')).toBe('평범한 문장')
  })
})
