import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { OllamaAiClient } from '@/ai/ollama'

type Call = { url: string; body: Record<string, unknown>; signal: AbortSignal | null | undefined }

const schema = z.object({ a: z.string() })
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
function chatReply(content: string) {
  return ndjsonReply([
    { model: MODEL, message: { role: 'assistant', content }, done: false },
    {
      model: MODEL,
      message: { role: 'assistant', content: '' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 10,
      eval_count: 5,
    },
  ])
}

function ndjsonReply(lines: Record<string, unknown>[]) {
  return new Response(lines.map((line) => JSON.stringify(line)).join('\n') + '\n', {
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

function client(fetchImpl: typeof fetch) {
  return new OllamaAiClient({
    model: MODEL,
    numCtx: 65536,
    think: true,
    thinkByTask: { 'continuity-check': false },
    baseUrl: 'http://ollama.test',
    fetch: fetchImpl,
  })
}

const checkTask = { name: 'continuity-check' as const, input: {} }
const extractTask = { name: 'chapter-extract' as const, input: {} }

describe('OllamaAiClient thinkByTask', () => {
  it('uses the per-task think override', async () => {
    const { calls, fetch } = fakeFetch([chatReply('{"a":"x"}')])
    await client(fetch).generateObject({
      task: checkTask,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].body.think).toBe(false)
  })

  it('keeps the default think for a task without an override', async () => {
    const { calls, fetch } = fakeFetch([chatReply('{"a":"x"}')])
    await client(fetch).generateObject({
      task: extractTask,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].body.think).toBe(true)
  })

  it('applies the override to the JSON retry', async () => {
    const { calls, fetch } = fakeFetch([chatReply('not json'), chatReply('{"a":"x"}')])
    await client(fetch).generateObject({
      task: checkTask,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema,
      effort: 'low',
      maxTokens: 4000,
    })

    expect(calls).toHaveLength(2)
    expect(calls[0].body.think).toBe(false)
    expect(calls[1].body.think).toBe(false)
  })

  it('applies the override to a stream', async () => {
    const { calls, fetch } = fakeFetch([chatReply('본문')])
    const { textStream, final } = client(fetch).streamText({
      task: checkTask,
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'low',
      maxTokens: 4000,
    })
    for await (const _chunk of textStream) {
      // drain the text stream so the request finishes
    }
    await final

    expect(calls).toHaveLength(1)
    expect(calls[0].body.think).toBe(false)
  })
})
