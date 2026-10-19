import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import { type OllamaAttempt, OllamaAiClient } from '@/ai/ollama'
import { AppError } from '@/lib/errors'

const schema = z.object({ a: z.string() })
const task = { name: 'proofread' as const, input: {} }
const MODEL = 'qwen3.5:9b'

/** Fetch stub that answers with the next queued response. */
function fakeFetch(replies: Response[]) {
  const fetchStub = async () => {
    const next = replies.shift()
    if (!next) throw new Error('no reply queued')
    return next
  }
  return fetchStub as typeof fetch
}

function ndjsonReply(lines: Record<string, unknown>[]) {
  return new Response(lines.map((line) => JSON.stringify(line)).join('\n') + '\n', {
    headers: { 'content-type': 'application/x-ndjson' },
  })
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

const timings = {
  load_duration: 2e9,
  prompt_eval_duration: 3e9,
  eval_duration: 4e9,
  total_duration: 10e9,
  prompt_eval_count: 100,
  eval_count: 40,
  done_reason: 'stop',
}

function client(fetchImpl: typeof fetch, onAttempt?: (a: OllamaAttempt) => void) {
  return new OllamaAiClient({
    model: MODEL,
    numCtx: 65536,
    baseUrl: 'http://ollama.test',
    fetch: fetchImpl,
    onAttempt,
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

const objectArgs = {
  task,
  system: 'SYSTEM',
  prompt: 'PROMPT',
  schema,
  effort: 'low' as const,
  maxTokens: 4000,
}

describe('OllamaAiClient per-attempt reporting', () => {
  it('reports one attempt with timings in ms', async () => {
    const attempts: OllamaAttempt[] = []
    const fetch = fakeFetch([chatReply('{"a":"x"}', timings)])
    await client(fetch, (a) => attempts.push(a)).generateObject(objectArgs)

    expect(attempts).toEqual([
      {
        task: 'proofread',
        model: MODEL,
        attempt: 1,
        done: true,
        doneReason: 'stop',
        loadMs: 2000,
        promptEvalMs: 3000,
        evalMs: 4000,
        totalMs: 10000,
        otherMs: 1000,
        promptEvalCount: 100,
        evalCount: 40,
        thinkingChunks: 0,
        thinkingChars: 0,
      },
    ])
  })

  it('counts thinking chunks and characters', async () => {
    const attempts: OllamaAttempt[] = []
    const fetch = fakeFetch([
      ndjsonReply([
        {
          model: MODEL,
          message: { role: 'assistant', content: '', thinking: '생각 1' },
          done: false,
        },
        { model: MODEL, message: { role: 'assistant', content: '', thinking: '' }, done: false },
        {
          model: MODEL,
          message: { role: 'assistant', content: '', thinking: '생각 22' },
          done: false,
        },
        { model: MODEL, message: { role: 'assistant', content: '{"a":"x"}' }, done: false },
        {
          model: MODEL,
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop',
        },
      ]),
    ])
    const result = await client(fetch, (a) => attempts.push(a)).generateObject(objectArgs)

    expect(result.object).toEqual({ a: 'x' })
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ thinkingChunks: 2, thinkingChars: 9 })
  })

  it('numbers the two attempts of a structured call', async () => {
    const attempts: OllamaAttempt[] = []
    const fetch = fakeFetch([chatReply('not json', timings), chatReply('{"a":"x"}', timings)])
    await client(fetch, (a) => attempts.push(a)).generateObject(objectArgs)

    expect(attempts.map((a) => a.attempt)).toEqual([1, 2])
  })

  it('reports null for timing fields the server left out', async () => {
    const attempts: OllamaAttempt[] = []
    const fetch = fakeFetch([
      ndjsonReply([
        {
          model: MODEL,
          message: { role: 'assistant', content: '{"a":"x"}' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 10,
          eval_count: 5,
        },
      ]),
    ])
    await client(fetch, (a) => attempts.push(a)).generateObject(objectArgs)

    expect(attempts[0]).toMatchObject({
      done: true,
      loadMs: null,
      promptEvalMs: null,
      evalMs: null,
      totalMs: null,
      otherMs: null,
      promptEvalCount: 10,
      evalCount: 5,
    })
  })

  it('reports done_reason length with the length error', async () => {
    const attempts: OllamaAttempt[] = []
    const fetch = fakeFetch([chatReply('{"a":', { ...timings, done_reason: 'length' })])
    const error = await catchError(
      client(fetch, (a) => attempts.push(a)).generateObject(objectArgs),
    )

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).message).toBe(MAX_TOKENS_MESSAGE)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ doneReason: 'length', done: true })
  })

  it('reports an unfinished attempt when the stream ends without a done chunk', async () => {
    const attempts: OllamaAttempt[] = []
    const fetch = fakeFetch([
      ndjsonReply([
        {
          model: MODEL,
          message: { role: 'assistant', content: '', thinking: '생각' },
          done: false,
        },
        { model: MODEL, message: { role: 'assistant', content: '{"a":"x"}' }, done: false },
      ]),
    ])
    const error = await catchError(
      client(fetch, (a) => attempts.push(a)).generateObject(objectArgs),
    )

    expect(error).toBeInstanceOf(AppError)
    expect(attempts).toEqual([
      expect.objectContaining({
        done: false,
        doneReason: null,
        loadMs: null,
        promptEvalMs: null,
        evalMs: null,
        totalMs: null,
        otherMs: null,
        thinkingChunks: 1,
      }),
    ])
  })

  it('reports an unfinished attempt for a mid-stream error chunk', async () => {
    const attempts: OllamaAttempt[] = []
    const fetch = fakeFetch([ndjsonReply([{ error: 'runner crashed' }])])
    const error = await catchError(
      client(fetch, (a) => attempts.push(a)).generateObject(objectArgs),
    )

    expect(error).toBeInstanceOf(AppError)
    expect(attempts).toEqual([expect.objectContaining({ done: false, attempt: 1 })])
  })

  it('reports a stream call as attempt 1', async () => {
    const attempts: OllamaAttempt[] = []
    const fetch = fakeFetch([chatReply('Hello', timings)])
    const stream = client(fetch, (a) => attempts.push(a)).streamText({
      task: { name: 'draft-chapter', input: {} },
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'low',
      maxTokens: 4000,
    })
    const chunks: string[] = []
    for await (const chunk of stream.textStream) chunks.push(chunk)
    expect(chunks.join('')).toBe('Hello')
    await stream.final

    expect(attempts).toEqual([
      expect.objectContaining({ task: 'draft-chapter', attempt: 1, done: true }),
    ])
  })

  it('works without onAttempt', async () => {
    const fetch = fakeFetch([chatReply('{"a":"x"}', timings)])
    const result = await client(fetch).generateObject(objectArgs)

    expect(result.object).toEqual({ a: 'x' })
  })
})
