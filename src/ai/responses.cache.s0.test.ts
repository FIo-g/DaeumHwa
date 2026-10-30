import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ResponsesAiClient } from '@/ai/responses'

const OutputSchema = z.object({ answer: z.string(), score: z.number() })
const MODEL = 'muse-spark-1.3-contributor'

function completed(usage: Record<string, unknown>) {
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
        content: [{ type: 'output_text', text: '{"answer":"네","score":3}', annotations: [] }],
      },
    ],
    usage,
  }
}

function makeClient(usage: Record<string, unknown>) {
  const fetchImpl = (async () =>
    new Response(JSON.stringify(completed(usage)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
  return new ResponsesAiClient({
    baseUrl: 'https://gateway.test/v1',
    apiKey: 'oc-test-key',
    fetch: fetchImpl,
    defaultModel: MODEL,
    retryBaseDelayMs: 0,
  })
}

const baseArgs = {
  system: '시스템 지시',
  prompt: '질문',
  schema: OutputSchema,
  effort: 'low' as const,
  maxTokens: 500,
  task: { name: 'proofread' as const, input: {} },
}

describe('ResponsesAiClient cache usage', () => {
  it('reports cached input tokens as cache reads', async () => {
    const client = makeClient({
      input_tokens: 1200,
      output_tokens: 40,
      input_tokens_details: { cached_tokens: 1024 },
    })
    const result = await client.generateObject(baseArgs)
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 40, cacheReadTokens: 1024 })
  })

  it('keeps the old shape without input_tokens_details', async () => {
    const client = makeClient({ input_tokens: 1200, output_tokens: 40 })
    const result = await client.generateObject(baseArgs)
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 40 })
  })
})
