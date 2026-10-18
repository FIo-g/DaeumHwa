import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  apiFormatFor,
  createOpencodeResponsesClient,
  createOpencodeSdk,
  OpencodeAiClient,
  OPENCODE_OPENAI_BASE_URL,
} from '@/ai/opencode'
import { isTrainingDataModel } from '@/ai/models'

const OutputSchema = z.object({ answer: z.string(), score: z.number() })
const ENV_KEYS = [
  'OPENCODE_API_KEY',
  'OPENCODE_BASE_URL',
  'OPENCODE_OPENAI_BASE_URL',
  'OPENCODE_API_FORMAT',
  'OPENCODE_MODEL',
  'OPENCODE_MODEL_IMPORT',
] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  process.env.OPENCODE_API_KEY = 'oc-test-key'
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

const ANTHROPIC_URL = 'https://opencode.ai/inference/go/anthropic/v1/messages'
const RESPONSES_URL = 'https://opencode.ai/inference/go/openai/v1/responses'

/** Fake fetch for both formats. Anthropic answers get a message, Responses answers get output_text. */
function routedFetch() {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    requests.push({ url, headers: new Headers(init?.headers), body })
    const answer = '{"answer":"네","score":3}'
    const json = url.endsWith('/responses')
      ? {
          model: body.model,
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: answer, annotations: [] }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 2 },
        }
      : {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [{ type: 'text', text: answer, citations: null }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 2 },
        }
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requests }
}

const baseArgs = {
  system: '시스템',
  prompt: '질문',
  schema: OutputSchema,
  effort: 'low' as const,
  maxTokens: 500,
  task: { name: 'proofread' as const, input: {} },
}

describe('apiFormatFor routing', () => {
  it('sends Claude-family models to the Anthropic format', () => {
    expect(apiFormatFor('claude-haiku-5-5')).toBe('anthropic')
    expect(apiFormatFor('qwen3.8-flash')).toBe('anthropic')
    expect(apiFormatFor('minimax-m3')).toBe('anthropic')
  })

  it.each([
    'muse-spark-1.3-contributor',
    'muse-spark-1.2-contributor',
    'gpt-6-luna',
    'gpt-5.6-luna',
    'grok-4.7',
  ])('sends %s to the Responses format', (model) => {
    expect(apiFormatFor(model)).toBe('responses')
  })

  it('routes unlisted ids with the gpt-, grok- and muse- prefixes to Responses', () => {
    expect(apiFormatFor('gpt-7-luna')).toBe('responses')
    expect(apiFormatFor('grok-5')).toBe('responses')
    expect(apiFormatFor('muse-spark-2')).toBe('responses')
  })

  it('lets OPENCODE_API_FORMAT force one format for every model', () => {
    process.env.OPENCODE_API_FORMAT = 'anthropic'
    expect(apiFormatFor('muse-spark-1.3-contributor')).toBe('anthropic')
    process.env.OPENCODE_API_FORMAT = 'responses'
    expect(apiFormatFor('claude-haiku-5-5')).toBe('responses')
  })

  it('ignores an unknown OPENCODE_API_FORMAT and routes by model', () => {
    process.env.OPENCODE_API_FORMAT = 'chat'
    expect(apiFormatFor('claude-haiku-5-5')).toBe('anthropic')
    expect(apiFormatFor('grok-4.7')).toBe('responses')
  })
})

describe('OpencodeAiClient per-call routing', () => {
  it('sends a Responses default model and an Anthropic import model to their own endpoints', async () => {
    const { fetchImpl, requests } = routedFetch()
    const client = new OpencodeAiClient(
      createOpencodeSdk({ fetch: fetchImpl }),
      'muse-spark-1.3-contributor',
      createOpencodeResponsesClient({ fetch: fetchImpl }),
    )

    await client.generateObject({ ...baseArgs, model: 'claude-haiku-5-5' })
    await client.generateObject(baseArgs)

    expect(requests.map((r) => r.url)).toEqual([ANTHROPIC_URL, RESPONSES_URL])
    expect(requests[0].body.model).toBe('claude-haiku-5-5')
    expect(requests[1].body.model).toBe('muse-spark-1.3-contributor')
    expect(requests[1].body).toHaveProperty('instructions', '시스템')
  })

  it('uses the Responses endpoint for an import model set to a Responses model', async () => {
    const { fetchImpl, requests } = routedFetch()
    const client = new OpencodeAiClient(
      createOpencodeSdk({ fetch: fetchImpl }),
      'claude-haiku-5-5',
      createOpencodeResponsesClient({ fetch: fetchImpl }),
    )
    const result = await client.generateObject({ ...baseArgs, model: 'gpt-6-luna' })
    expect(result.object).toEqual({ answer: '네', score: 3 })
    expect(requests[0].url).toBe(RESPONSES_URL)
    expect(client.provider).toBe('opencode')
  })

  it('shares the session id and User-Agent between both formats', async () => {
    const { fetchImpl, requests } = routedFetch()
    const client = new OpencodeAiClient(
      createOpencodeSdk({ fetch: fetchImpl }),
      'claude-haiku-5-5',
      createOpencodeResponsesClient({ fetch: fetchImpl }),
    )
    await client.generateObject(baseArgs)
    await client.generateObject({ ...baseArgs, model: 'grok-4.7' })
    const [anthropic, responses] = requests
    expect(responses.headers.get('x-opencode-session')).toMatch(/^daeumhwa-/)
    expect(responses.headers.get('x-opencode-session')).toBe(
      anthropic.headers.get('x-opencode-session'),
    )
    expect(responses.headers.get('user-agent')).toBe('daeumhwa/0.1')
    expect(responses.headers.get('authorization')).toBe('Bearer oc-test-key')
  })

  it('honors OPENCODE_API_FORMAT for every call', async () => {
    process.env.OPENCODE_API_FORMAT = 'anthropic'
    const { fetchImpl, requests } = routedFetch()
    const client = new OpencodeAiClient(
      createOpencodeSdk({ fetch: fetchImpl }),
      'claude-haiku-5-5',
      createOpencodeResponsesClient({ fetch: fetchImpl }),
    )
    await client.generateObject({ ...baseArgs, model: 'muse-spark-1.3-contributor' })
    expect(requests[0].url).toBe(ANTHROPIC_URL)
  })
})

describe('OpenAI-format base URL', () => {
  it('defaults to the OpenCode Go OpenAI-compatible endpoint', async () => {
    expect(OPENCODE_OPENAI_BASE_URL).toBe('https://opencode.ai/inference/go/openai/v1')
    const { fetchImpl, requests } = routedFetch()
    const client = new OpencodeAiClient(
      createOpencodeSdk({ fetch: fetchImpl }),
      'muse-spark-1.3-contributor',
      createOpencodeResponsesClient({ fetch: fetchImpl }),
    )
    await client.generateObject(baseArgs)
    expect(requests[0].url).toBe(RESPONSES_URL)
  })

  it('uses OPENCODE_OPENAI_BASE_URL when it is set', async () => {
    process.env.OPENCODE_OPENAI_BASE_URL = 'https://gateway.example.test/openai/v1/'
    const { fetchImpl, requests } = routedFetch()
    const client = new OpencodeAiClient(
      createOpencodeSdk({ fetch: fetchImpl }),
      'gpt-6-luna',
      createOpencodeResponsesClient({ fetch: fetchImpl }),
    )
    await client.generateObject(baseArgs)
    expect(requests[0].url).toBe('https://gateway.example.test/openai/v1/responses')
  })
})

describe('isTrainingDataModel', () => {
  it('is true for Contributor models, which may train on prompts', () => {
    expect(isTrainingDataModel('muse-spark-1.3-contributor')).toBe(true)
    expect(isTrainingDataModel('muse-spark-1.2-contributor')).toBe(true)
    expect(isTrainingDataModel('gemini-4-argon-contributor')).toBe(true)
  })

  it('is false for models with no training use', () => {
    expect(isTrainingDataModel('claude-haiku-5-5')).toBe(false)
    expect(isTrainingDataModel('gpt-6-luna')).toBe(false)
    expect(isTrainingDataModel('grok-4.7')).toBe(false)
  })
})
