import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AI_TASKS } from '@/db/types'
import {
  checkHelperThink,
  createModelClient,
  HELPER_TASKS,
  helperThinkValue,
  MODEL_PROFILES,
  PROSE_TASKS,
  retryThinkFor,
  thinkFor,
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

describe('HELPER_TASKS', () => {
  it('holds every task except the prose tasks', () => {
    for (const task of PROSE_TASKS) {
      expect(HELPER_TASKS).not.toContain(task)
    }
    expect(HELPER_TASKS).toHaveLength(AI_TASKS.length - PROSE_TASKS.length)
    expect(HELPER_TASKS).toContain('paragraph-trim')
    expect(HELPER_TASKS).toContain('draft-repair')
  })

  it('keeps scene prose out of the helper tasks', () => {
    expect(HELPER_TASKS).not.toContain('draft-scene')
    expect(PROSE_TASKS).toContain('draft-scene')
  })
})

describe('helperThinkValue', () => {
  it('maps off to false and keeps the levels', () => {
    expect(helperThinkValue('off')).toBe(false)
    expect(helperThinkValue('low')).toBe('low')
  })
})

describe('thinkFor', () => {
  it('returns the helper value for a helper task only', () => {
    const qwen = MODEL_PROFILES['qwen3.8-27b']
    expect(thinkFor(qwen, 'proofread', 'off')).toBe(false)
    expect(thinkFor(qwen, 'draft-chapter', 'off')).toBe(true)
    expect(thinkFor(qwen, 'draft-continue', 'off')).toBe(true)
    expect(thinkFor(qwen, 'proofread')).toBe(true)
    expect(thinkFor(MODEL_PROFILES.fake, 'proofread', 'off')).toBeNull()
  })

  it('keeps the profile think for scene prose', () => {
    expect(thinkFor(MODEL_PROFILES['qwen3.8-27b'], 'draft-scene', 'off')).toBe(true)
  })
})

describe('checkHelperThink', () => {
  it('accepts off only on a boolean-think profile that turns thinking on', () => {
    expect(checkHelperThink(MODEL_PROFILES['qwen3.8-27b'], 'off')).toBeNull()
    expect(checkHelperThink(MODEL_PROFILES['qwen3.8-27b'], 'low')).not.toBeNull()
  })

  it('accepts a level only on a level-think profile, and rejects off there', () => {
    expect(checkHelperThink(MODEL_PROFILES['gpt-oss-20b'], 'low')).toBeNull()
    expect(checkHelperThink(MODEL_PROFILES['gpt-oss-20b'], 'off')).not.toBeNull()
  })

  it('rejects every value on a profile with thinking off', () => {
    expect(checkHelperThink(MODEL_PROFILES['exaone3.5-32b'], 'off')).not.toBeNull()
    expect(checkHelperThink(MODEL_PROFILES['exaone3.5-32b'], 'low')).not.toBeNull()
  })

  it('rejects every value on cloud and fake profiles', () => {
    for (const id of ['haiku-5.5', 'luna-6', 'fake'] as const) {
      expect(checkHelperThink(MODEL_PROFILES[id], 'off')).not.toBeNull()
    }
  })
})

describe('createModelClient helperThink', () => {
  it('wires helperThink into the request body', async () => {
    const { calls, fetch } = fakeFetch([chatReply('{"suggestions":[]}'), chatReply('본문')])
    const client = createModelClient(MODEL_PROFILES['qwen3.8-27b'], {
      helperThink: 'off',
      fetch,
    })

    const object = await client.generateObject({
      task: { name: 'proofread', input: {} },
      system: 'SYSTEM',
      prompt: 'PROMPT',
      schema: z.object({ suggestions: z.array(z.string()) }),
      effort: 'max',
      maxTokens: 4000,
    })
    const stream = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: 'SYSTEM',
      prompt: 'PROMPT',
      effort: 'max',
      maxTokens: 4000,
    })
    const chunks: string[] = []
    for await (const chunk of stream.textStream) chunks.push(chunk)
    await stream.final

    expect(object.object).toEqual({ suggestions: [] })
    expect(chunks.join('')).toBe('본문')
    expect(calls).toHaveLength(2)
    expect(calls[0].body.think).toBe(false)
    expect(calls[1].body.think).toBe(true)
  })
})

describe('retryThinkFor prose', () => {
  it('does not lower the think of scene prose', () => {
    expect(retryThinkFor(MODEL_PROFILES['qwen3.8-27b'], 'draft-scene')).toBeNull()
  })
})
