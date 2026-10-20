import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { OllamaCallStats } from '@/ai/ollama'
import type { AiTaskName } from '@/db/types'
import {
  createModelClient,
  createRetryClient,
  lowerThink,
  MODEL_PROFILES,
  type ModelId,
  retryThinkFor,
} from './models'

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

/** One streamed answer: a single content chunk followed by the done chunk. */
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
        prompt_eval_count: 10,
        eval_count: 5,
      }),
    ].join('\n') + '\n',
    { headers: { 'content-type': 'application/x-ndjson' } },
  )
}

const objectCall = (task: AiTaskName, schema: z.ZodType = proofreadTask.schema) => ({
  task: { name: task, input: {} },
  system: 'SYSTEM',
  prompt: 'PROMPT',
  schema,
  effort: 'max' as const,
  maxTokens: 32000,
})

describe('lowerThink', () => {
  it('steps think down one level', () => {
    expect(lowerThink(true)).toBe(false)
    expect(lowerThink('high')).toBe('medium')
    expect(lowerThink('medium')).toBe('low')
  })

  it('gives null where nothing is lower', () => {
    expect(lowerThink('low')).toBeNull()
    expect(lowerThink(false)).toBeNull()
    expect(lowerThink(null)).toBeNull()
    expect(lowerThink(undefined)).toBeNull()
  })
})

describe('retryThinkFor', () => {
  it('lowers helper tasks and keeps prose tasks', () => {
    const qwen = MODEL_PROFILES['qwen3.8-27b']
    const gptOss = MODEL_PROFILES['gpt-oss-20b']
    expect(retryThinkFor(qwen, 'proofread')).toBe(false)
    expect(retryThinkFor(qwen, 'draft-chapter')).toBeNull()
    expect(retryThinkFor(qwen, 'draft-continue')).toBeNull()
    expect(retryThinkFor(qwen, 'scene-rewrite')).toBeNull()
    expect(retryThinkFor(gptOss, 'proofread')).toBe('medium')
  })

  it('is null where there is no Ollama think to lower', () => {
    for (const id of ['exaone3.5-32b', 'haiku-5.5', 'luna-6', 'fake'] as const) {
      expect(retryThinkFor(MODEL_PROFILES[id], 'proofread')).toBeNull()
    }
  })

  it('follows the helper setting', () => {
    const qwen = MODEL_PROFILES['qwen3.8-27b']
    const gptOss = MODEL_PROFILES['gpt-oss-20b']
    expect(retryThinkFor(qwen, 'proofread', 'off')).toBeNull()
    expect(retryThinkFor(gptOss, 'proofread', 'high')).toBe('medium')
    expect(retryThinkFor(gptOss, 'proofread', 'low')).toBeNull()
  })
})

describe('createRetryClient', () => {
  it('is undefined where nothing can be lowered', () => {
    const ids: ModelId[] = ['exaone3.5-32b', 'haiku-5.5', 'luna-6', 'fake']
    for (const id of ids) {
      expect(createRetryClient(MODEL_PROFILES[id])).toBeUndefined()
    }
    expect(createRetryClient(MODEL_PROFILES['qwen3.8-27b'], { helperThink: 'off' })).toBeUndefined()
  })

  it('lowers think in the request body', async () => {
    expect.assertions(4)
    const qwen = fakeFetch([chatReply('{"suggestions":[]}'), chatReply('본문')])
    const client = createRetryClient(MODEL_PROFILES['qwen3.8-27b'], { fetch: qwen.fetch })
    if (!client) throw new Error('expected a retry client')
    await client.generateObject(objectCall('proofread'))
    const stream = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'max',
      maxTokens: 32000,
    })
    let text = ''
    for await (const piece of stream.textStream) text += piece
    expect(text).toBe('본문')
    await stream.final
    expect(qwen.calls[0]?.body.think).toBe(false)
    expect(qwen.calls[1]?.body.think).toBe(true)

    const gptOss = fakeFetch([chatReply('{"suggestions":[]}')])
    const gptClient = createRetryClient(MODEL_PROFILES['gpt-oss-20b'], { fetch: gptOss.fetch })
    if (!gptClient) throw new Error('expected a retry client')
    await gptClient.generateObject(objectCall('proofread'))
    expect(gptOss.calls[0]?.body.think).toBe('medium')
  })

  it('forwards onStats', async () => {
    const stats: OllamaCallStats[] = []
    const qwen = fakeFetch([chatReply('{"suggestions":[]}')])
    const client = createRetryClient(MODEL_PROFILES['qwen3.8-27b'], {
      fetch: qwen.fetch,
      onStats: (s) => stats.push(s),
    })
    if (!client) throw new Error('expected a retry client')
    await client.generateObject(objectCall('proofread'))
    expect(stats).toHaveLength(1)
    expect(stats[0]?.task).toBe('proofread')
  })
})

describe('createModelClient', () => {
  it('is unchanged: qwen still sends think true for proofread', async () => {
    const qwen = fakeFetch([chatReply('{"suggestions":[]}')])
    const client = createModelClient(MODEL_PROFILES['qwen3.8-27b'], { fetch: qwen.fetch })
    await client.generateObject(objectCall('proofread'))
    expect(qwen.calls[0]?.body.think).toBe(true)
  })
})
