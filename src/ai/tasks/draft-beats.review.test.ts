import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { FORMAT_MESSAGE } from '@/ai/anthropic'
import { OllamaAiClient } from '@/ai/ollama'
import { draftBeatsTask, DraftBeatsSchema } from '@/ai/tasks/draft-beats'
import { AppError } from '@/lib/errors'

const MODEL = 'qwen3.5:9b'

/** Fetch stub that answers each request with the next queued response. */
function fakeFetch(replies: Response[]) {
  const calls: Record<string, unknown>[] = []
  const fetchStub = async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    const next = replies.shift()
    if (!next) throw new Error('no reply queued')
    return next
  }
  return { calls, fetch: fetchStub as typeof fetch }
}

/** One streamed answer: a single content chunk followed by the done chunk. */
function chatReply(content: string) {
  const lines = [
    { model: MODEL, message: { role: 'assistant', content }, done: false },
    {
      model: MODEL,
      message: { role: 'assistant', content: '' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 10,
      eval_count: 5,
    },
  ]
  return new Response(lines.map((line) => JSON.stringify(line)).join('\n') + '\n', {
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

function client(fetchImpl: typeof fetch) {
  return new OllamaAiClient({
    model: MODEL,
    numCtx: 65536,
    temperature: 0.6,
    topP: 0.95,
    topK: 20,
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

describe('DraftBeatsSchema at least one scene', () => {
  it('rejects an empty scene list', () => {
    expect(() => DraftBeatsSchema.parse({ scenes: [] })).toThrow(ZodError)
  })

  it('accepts a list with one valid scene', () => {
    const one = {
      scenes: [
        { place: '탑 입구', characters: ['서윤'], objects: [], sequence: ['서윤이 걷는다.'] },
      ],
    }
    expect(DraftBeatsSchema.parse(one)).toEqual(one)
  })
})

describe('draft-beats through OllamaAiClient', () => {
  it('records an empty beat list as an AI error after the JSON retry', async () => {
    const { calls, fetch } = fakeFetch([chatReply('{"scenes":[]}'), chatReply('{"scenes":[]}')])
    const error = await catchError(
      client(fetch).generateObject({
        task: { name: draftBeatsTask.name, input: {} },
        system: draftBeatsTask.system,
        prompt: 'PROMPT',
        schema: draftBeatsTask.schema,
        effort: 'medium',
        maxTokens: 4000,
      }),
    )

    expect(calls).toHaveLength(2)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'AI_ERROR', message: FORMAT_MESSAGE })
  })
})
