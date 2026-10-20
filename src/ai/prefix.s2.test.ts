import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { AnthropicAiClient } from '@/ai/anthropic'
import { cacheKeyFor, runAiTask } from '@/ai/run'
import { ResponsesAiClient } from '@/ai/responses'
import type { AiClient, AiTaskDef, GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'

const OutputSchema = z.object({ answer: z.string() })
const MODEL = 'claude-haiku-5-5'
const CACHE_KEY = 'w0123456789abcdef'

const baseArgs = {
  system: '시스템 지시',
  prompt: '질문',
  schema: OutputSchema,
  effort: 'medium' as const,
  maxTokens: 1000,
  task: { name: 'proofread' as const, input: {} },
}

/** SDK stub that records the params of each parse call and answers with a fixed object. */
function spySdk(calls: Record<string, unknown>[]) {
  const sdk = {
    messages: {
      parse: async (params: Record<string, unknown>) => {
        calls.push(params)
        return {
          parsed_output: { answer: '네' },
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
          model: MODEL,
          content: [],
        }
      },
    },
  }
  return sdk as unknown as Anthropic
}

function completed() {
  return {
    id: 'resp_test',
    object: 'response',
    model: MODEL,
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: '{"answer":"네"}', annotations: [] }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1 },
  }
}

/** Fetch stub that records each request body and answers with a completed response. */
function spyFetch(bodies: Record<string, unknown>[]) {
  return (async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify(completed()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

function responsesClient(bodies: Record<string, unknown>[]) {
  return new ResponsesAiClient({
    baseUrl: 'https://gateway.test/v1',
    apiKey: 'oc-test-key',
    fetch: spyFetch(bodies),
    defaultModel: MODEL,
    retryBaseDelayMs: 0,
  })
}

const PREFIX = ['<core_wiki>\n작품 설정\n</core_wiki>', '<voices>\n인물 말투\n</voices>']

describe('AnthropicAiClient prompt prefix', () => {
  it('sends the plain prompt string when there is no prefix', async () => {
    const calls: Record<string, unknown>[] = []
    const client = new AnthropicAiClient(spySdk(calls), MODEL)
    await client.generateObject(baseArgs)
    expect(calls[0]).toEqual({
      model: MODEL,
      max_tokens: 1000,
      system: [{ type: 'text', text: '시스템 지시', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: '질문' }],
      output_config: { format: expect.anything(), effort: 'medium' },
    })
  })

  it('sends each prefix block with a cache mark, then the prompt without one', async () => {
    const calls: Record<string, unknown>[] = []
    const client = new AnthropicAiClient(spySdk(calls), MODEL)
    await client.generateObject({ ...baseArgs, promptPrefix: PREFIX, cacheKey: CACHE_KEY })
    expect(calls[0].messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: PREFIX[0], cache_control: { type: 'ephemeral' } },
          { type: 'text', text: PREFIX[1], cache_control: { type: 'ephemeral' } },
          { type: 'text', text: '질문' },
        ],
      },
    ])
  })

  it('puts exactly three cache marks on the body with two prefix blocks: system and both blocks', async () => {
    const calls: Record<string, unknown>[] = []
    const client = new AnthropicAiClient(spySdk(calls), MODEL)
    await client.generateObject({ ...baseArgs, promptPrefix: PREFIX })
    const marks = JSON.stringify(calls[0]).split('"cache_control"').length - 1
    expect(marks).toBe(3)
  })

  it('never sends the cache key to Anthropic', async () => {
    const calls: Record<string, unknown>[] = []
    const client = new AnthropicAiClient(spySdk(calls), MODEL)
    await client.generateObject({ ...baseArgs, promptPrefix: PREFIX, cacheKey: CACHE_KEY })
    expect(JSON.stringify(calls[0])).not.toContain(CACHE_KEY)
  })
})

describe('ResponsesAiClient prompt prefix', () => {
  const previous = process.env.AI_PROMPT_CACHE_KEY

  beforeEach(() => {
    delete process.env.AI_PROMPT_CACHE_KEY
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.AI_PROMPT_CACHE_KEY
    else process.env.AI_PROMPT_CACHE_KEY = previous
  })

  it('sends the plain prompt as one input_text part when there is no prefix', async () => {
    const bodies: Record<string, unknown>[] = []
    await responsesClient(bodies).generateObject(baseArgs)
    expect(bodies[0]).toEqual({
      model: MODEL,
      instructions: '시스템 지시',
      input: [{ role: 'user', content: [{ type: 'input_text', text: '질문' }] }],
      max_output_tokens: 1000,
      store: false,
      reasoning: { effort: 'medium' },
      text: expect.anything(),
    })
  })

  it('sends the prefix blocks as input_text parts before the prompt', async () => {
    const bodies: Record<string, unknown>[] = []
    await responsesClient(bodies).generateObject({ ...baseArgs, promptPrefix: PREFIX })
    expect(bodies[0].input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: PREFIX[0] },
          { type: 'input_text', text: PREFIX[1] },
          { type: 'input_text', text: '질문' },
        ],
      },
    ])
  })

  it('sends prompt_cache_key only when the env switch is on', async () => {
    const off: Record<string, unknown>[] = []
    await responsesClient(off).generateObject({ ...baseArgs, cacheKey: CACHE_KEY })
    expect(off[0]).not.toHaveProperty('prompt_cache_key')

    process.env.AI_PROMPT_CACHE_KEY = '1'
    const on: Record<string, unknown>[] = []
    await responsesClient(on).generateObject({ ...baseArgs, cacheKey: CACHE_KEY })
    expect(on[0].prompt_cache_key).toBe(CACHE_KEY)

    const noKey: Record<string, unknown>[] = []
    await responsesClient(noKey).generateObject(baseArgs)
    expect(noKey[0]).not.toHaveProperty('prompt_cache_key')
  })
})

describe('FakeAiClient prompt prefix', () => {
  it('keeps the prefix and cache key on the recorded call', async () => {
    const client = new FakeAiClient({ overrides: { proofread: () => ({ answer: '네' }) } })
    await client.generateObject({ ...baseArgs, promptPrefix: PREFIX, cacheKey: CACHE_KEY })
    expect(client.recorded).toHaveLength(1)
    expect(client.recorded[0].promptPrefix).toEqual(PREFIX)
    expect(client.recorded[0].cacheKey).toBe(CACHE_KEY)
  })
})

describe('runAiTask prompt prefix', () => {
  async function setup(): Promise<{ db: Db; userId: string; workId: string }> {
    const db = await createTestDb()
    const user = await createTestUser(db)
    const work = await createTestWork(db, user.id)
    return { db, userId: user.id, workId: work.id }
  }

  it('passes the task prefix and the work cache key to the client', async () => {
    const { db, userId, workId } = await setup()
    const seen: GenerateObjectArgs<unknown>[] = []
    const client: AiClient = {
      provider: 'spy',
      defaultModel: MODEL,
      async generateObject<T>(args: GenerateObjectArgs<T>) {
        seen.push(args as GenerateObjectArgs<unknown>)
        return {
          object: { answer: '네' } as T,
          usage: { inputTokens: 1, outputTokens: 1 },
          model: MODEL,
        }
      },
      streamText() {
        throw new Error('unused')
      },
    }
    const task: AiTaskDef<{ q: string }, { answer: string }> = {
      name: 'proofread',
      effort: 'low',
      maxTokens: 100,
      system: '시스템',
      buildPrompt: (input) => input.q,
      buildPromptPrefix: () => PREFIX,
      schema: OutputSchema,
    }
    await runAiTask(db, { userId, workId }, task, { q: '질문' }, client)
    expect(seen[0].prompt).toBe('질문')
    expect(seen[0].promptPrefix).toEqual(PREFIX)
    expect(seen[0].cacheKey).toBe(cacheKeyFor(workId))
  })

  it('derives a stable cache key per work', () => {
    const key = cacheKeyFor('work-a')
    expect(key).toMatch(/^w[0-9a-f]{16}$/)
    expect(cacheKeyFor('work-a')).toBe(key)
    expect(cacheKeyFor('work-b')).not.toBe(key)
  })
})
