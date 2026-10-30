import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { OllamaAttempt } from '@/ai/ollama'
import { createModelClient, MODEL_PROFILES } from './models'

// Attempt callback wiring in createModelClient (track M2). Copies the helpers of models.F4.test.ts.

type Call = { url: string; body: Record<string, unknown> }

/** Fetch stub that records each request and answers with the next queued response. */
function fakeFetch(replies: Response[]) {
  const calls: Call[] = []
  const fetchStub = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    })
    const next = replies.shift()
    if (!next) throw new Error('no reply queued')
    return next
  }
  return { calls, fetch: fetchStub as typeof fetch }
}

/** One streamed answer: a single content chunk, then the done chunk with Ollama's timings. */
function chatReply(content: string) {
  return new Response(
    [
      JSON.stringify({
        model: 'qwen3.8:27b-mlx',
        message: { role: 'assistant', content },
        done: false,
      }),
      JSON.stringify({
        model: 'qwen3.8:27b-mlx',
        message: { role: 'assistant', content: '' },
        done: true,
        done_reason: 'stop',
        total_duration: 900_000_000,
        prompt_eval_count: 10,
        eval_count: 5,
      }),
    ].join('\n') + '\n',
    { headers: { 'content-type': 'application/x-ndjson' } },
  )
}

const PROOFREAD_ARGS = {
  task: { name: 'proofread' as const, input: {} },
  system: 'SYSTEM',
  prompt: 'PROMPT',
  schema: z.object({ suggestions: z.array(z.string()) }),
  effort: 'max' as const,
  maxTokens: 4000,
}

describe('createModelClient onAttempt', () => {
  it('passes onAttempt to the Ollama client', async () => {
    const { fetch } = fakeFetch([chatReply('{"suggestions":[]}')])
    const attempts: OllamaAttempt[] = []
    const client = createModelClient(MODEL_PROFILES['qwen3.8-27b'], {
      fetch,
      onAttempt: (a) => attempts.push(a),
    })

    await client.generateObject(PROOFREAD_ARGS)

    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({
      task: 'proofread',
      attempt: 1,
      done: true,
      totalMs: 900,
    })
  })

  it('works without onAttempt', async () => {
    const { fetch } = fakeFetch([chatReply('{"suggestions":[]}')])
    const client = createModelClient(MODEL_PROFILES['qwen3.8-27b'], { fetch })

    await expect(client.generateObject(PROOFREAD_ARGS)).resolves.toMatchObject({
      object: { suggestions: [] },
    })
  })
})
