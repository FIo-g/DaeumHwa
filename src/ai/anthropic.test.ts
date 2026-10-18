import { afterEach, describe, expect, it } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { AnthropicAiClient } from '@/ai/anthropic'
import { AppError } from '@/lib/errors'

type Call = { path: string; params: Record<string, unknown>; options?: unknown }

const OutputSchema = z.object({ answer: z.string(), score: z.number() })

function okResponse(model = 'claude-haiku-5-5', stopReason = 'end_turn') {
  return {
    parsed_output: { answer: '네', score: 3 },
    stop_reason: stopReason,
    usage: { input_tokens: 11, output_tokens: 22 },
    model,
    content: [],
  }
}

/**
 * Stub SDK. `parseResult` is returned from messages.parse (or beta.messages.parse) and
 * `streamDeltas` / `streamStop` drive messages.stream (or beta.messages.stream).
 */
function stubSdk(opts?: {
  parseResult?: unknown
  parseError?: unknown
  streamDeltas?: string[]
  streamStop?: string
  streamError?: unknown
}) {
  const calls: Call[] = []

  function makeStream(path: string, params: Record<string, unknown>) {
    calls.push({ path, params })
    const deltas = opts?.streamDeltas ?? ['안녕', '하세요']
    let textHandler: ((delta: string) => void) | undefined
    const stream = {
      on(event: string, handler: (delta: string) => void) {
        if (event === 'text') textHandler = handler
        return stream
      },
      finalMessage() {
        return new Promise((resolve, reject) => {
          queueMicrotask(() => {
            if (opts?.streamError) return reject(opts.streamError)
            for (const d of deltas) textHandler?.(d)
            resolve({
              content: [{ type: 'text', text: deltas.join('') }],
              stop_reason: opts?.streamStop ?? 'end_turn',
              usage: { input_tokens: 5, output_tokens: 6 },
              model: params.model,
            })
          })
        })
      },
    }
    return stream
  }

  function makeParse(path: string) {
    return async (params: Record<string, unknown>, options?: unknown) => {
      calls.push({ path, params, options })
      if (opts?.parseError) throw opts.parseError
      return opts?.parseResult ?? okResponse()
    }
  }

  const sdk = {
    messages: {
      parse: makeParse('messages.parse'),
      stream: (params: Record<string, unknown>) => makeStream('messages.stream', params),
    },
    beta: {
      messages: {
        parse: makeParse('beta.messages.parse'),
        stream: (params: Record<string, unknown>) => makeStream('beta.messages.stream', params),
      },
    },
  }
  return { sdk: sdk as unknown as Anthropic, calls }
}

const baseArgs = {
  system: '시스템 지시',
  prompt: '질문',
  schema: OutputSchema,
  effort: 'medium' as const,
  maxTokens: 1000,
  task: { name: 'proofread' as const, input: {} },
}

describe('AnthropicAiClient defaults', () => {
  const saved = process.env.ANTHROPIC_MODEL
  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_MODEL
    else process.env.ANTHROPIC_MODEL = saved
  })

  it('defaults to claude-haiku-5-5 when ANTHROPIC_MODEL is unset', () => {
    delete process.env.ANTHROPIC_MODEL
    const { sdk } = stubSdk()
    expect(new AnthropicAiClient(sdk).defaultModel).toBe('claude-haiku-5-5')
  })

  it('reads ANTHROPIC_MODEL when no model is passed', () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5'
    const { sdk } = stubSdk()
    expect(new AnthropicAiClient(sdk).defaultModel).toBe('claude-sonnet-5-5')
  })

  it('sends no fallback params for the haiku default', async () => {
    delete process.env.ANTHROPIC_MODEL
    const { sdk, calls } = stubSdk({ parseResult: okResponse('claude-haiku-5-5') })
    await new AnthropicAiClient(sdk).generateObject(baseArgs)
    expect(calls[0].path).toBe('messages.parse')
    expect((calls[0].params as { model: string }).model).toBe('claude-haiku-5-5')
    expect(calls[0].params).not.toHaveProperty('fallbacks')
  })
})

describe('AnthropicAiClient.generateObject', () => {
  it('sends a cached system prompt, the zod output format and effort, and returns parsed output', async () => {
    const { sdk, calls } = stubSdk()
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    const result = await client.generateObject(baseArgs)

    expect(result.object).toEqual({ answer: '네', score: 3 })
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 22 })
    expect(result.model).toBe('claude-haiku-5-5')

    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('messages.parse')
    const params = calls[0].params as {
      model: string
      max_tokens: number
      system: { type: string; text: string; cache_control: { type: string } }[]
      output_config: { effort: string; format: { type: string } }
      fallbacks?: unknown
    }
    expect(params.model).toBe('claude-haiku-5-5')
    expect(params.max_tokens).toBe(1000)
    expect(params.system).toEqual([
      { type: 'text', text: '시스템 지시', cache_control: { type: 'ephemeral' } },
    ])
    expect(params.output_config.effort).toBe('medium')
    expect(params.output_config.format.type).toBe('json_schema')
    expect(params.fallbacks).toBeUndefined()
  })

  it('uses the explicit model argument over the default model', async () => {
    const { sdk, calls } = stubSdk({ parseResult: okResponse('claude-haiku-5-5') })
    const client = new AnthropicAiClient(sdk, 'claude-opus-5-5')
    await client.generateObject({ ...baseArgs, model: 'claude-haiku-5-5' })
    expect((calls[0].params as { model: string }).model).toBe('claude-haiku-5-5')
  })

  it('enables server-side fallback through the beta API for opus models', async () => {
    const { sdk, calls } = stubSdk({ parseResult: okResponse('claude-opus-5-5') })
    const client = new AnthropicAiClient(sdk, 'claude-opus-5-5')
    await client.generateObject(baseArgs)

    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('beta.messages.parse')
    const params = calls[0].params as { betas: string[]; fallbacks: unknown }
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(params.fallbacks).toBe('default')
  })

  it('does not send fallback params for haiku', async () => {
    const { sdk, calls } = stubSdk({ parseResult: okResponse('claude-haiku-5-5') })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    await client.generateObject(baseArgs)
    expect(calls[0].path).toBe('messages.parse')
    const params = calls[0].params as { fallbacks?: unknown; betas?: unknown }
    expect(params.fallbacks).toBeUndefined()
    expect(params.betas).toBeUndefined()
  })

  it('throws AI_ERROR with a Korean message on refusal', async () => {
    const { sdk } = stubSdk({
      parseResult: { ...okResponse(), parsed_output: null, stop_reason: 'refusal' },
    })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    const error = await client.generateObject(baseArgs).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'AI_ERROR',
      message: 'AI가 이 요청을 처리하지 않았습니다.',
    })
  })

  it('throws AI_ERROR when the output was cut off by max_tokens', async () => {
    const { sdk } = stubSdk({
      parseResult: { ...okResponse(), parsed_output: null, stop_reason: 'max_tokens' },
    })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    await expect(client.generateObject(baseArgs)).rejects.toMatchObject({
      code: 'AI_ERROR',
      message: 'AI 응답이 너무 길어 중간에 끊겼습니다.',
    })
  })

  it('throws AI_ERROR when parsed_output is missing', async () => {
    const { sdk } = stubSdk({ parseResult: { ...okResponse(), parsed_output: null } })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    await expect(client.generateObject(baseArgs)).rejects.toMatchObject({
      code: 'AI_ERROR',
      message: 'AI 응답 형식이 올바르지 않습니다.',
    })
  })

  it('attaches the billed usage to refusal, max_tokens and missing-output errors', async () => {
    const cases = [
      { ...okResponse(), parsed_output: null, stop_reason: 'refusal' },
      { ...okResponse(), parsed_output: null, stop_reason: 'max_tokens' },
      { ...okResponse(), parsed_output: null, stop_reason: 'end_turn' },
    ]
    for (const parseResult of cases) {
      const { sdk } = stubSdk({ parseResult })
      const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
      const error = await client.generateObject(baseArgs).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(AppError)
      expect(error).toMatchObject({
        code: 'AI_ERROR',
        details: { usage: { inputTokens: 11, outputTokens: 22 } },
      })
    }
  })

  it('maps a rate limit error to AI_ERROR with the reason', async () => {
    const { sdk } = stubSdk({
      parseError: new Anthropic.RateLimitError(429, undefined, 'Too many requests', new Headers()),
    })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    await expect(client.generateObject(baseArgs)).rejects.toMatchObject({
      code: 'AI_ERROR',
      message: expect.stringContaining('AI 호출에 실패했습니다: '),
    })
  })

  it('maps an authentication error to AI_ERROR', async () => {
    const { sdk } = stubSdk({
      parseError: new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers()),
    })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    const error = await client.generateObject(baseArgs).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'AI_ERROR' })
    expect((error as AppError).message).toContain('API 키')
  })
})

describe('AnthropicAiClient.streamText', () => {
  it('yields text deltas and resolves final with the joined text and usage', async () => {
    const { sdk, calls } = stubSdk({ streamDeltas: ['첫 문단. ', '둘째 문단.'] })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    const { textStream, final } = client.streamText({
      system: '시스템',
      prompt: '초안 써 줘',
      effort: 'high',
      maxTokens: 2000,
      task: { name: 'proofread' as const, input: {} },
    })
    const chunks: string[] = []
    for await (const chunk of textStream) chunks.push(chunk)
    expect(chunks).toEqual(['첫 문단. ', '둘째 문단.'])

    const result = await final
    expect(result.text).toBe('첫 문단. 둘째 문단.')
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 6 })
    expect(calls[0].path).toBe('messages.stream')
    expect((calls[0].params as { output_config: { effort: string } }).output_config.effort).toBe(
      'high',
    )
  })

  it('uses the beta stream with fallbacks for opus models', async () => {
    const { sdk, calls } = stubSdk()
    const client = new AnthropicAiClient(sdk, 'claude-opus-5-5')
    const { final } = client.streamText({
      system: '시스템',
      prompt: '초안',
      effort: 'high',
      maxTokens: 2000,
      task: { name: 'proofread' as const, input: {} },
    })
    await final
    expect(calls[0].path).toBe('beta.messages.stream')
    const params = calls[0].params as { betas: string[]; fallbacks: unknown }
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(params.fallbacks).toBe('default')
  })

  it('rejects final with AI_ERROR on refusal', async () => {
    const { sdk } = stubSdk({ streamStop: 'refusal' })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    const { final } = client.streamText({
      system: 's',
      prompt: 'p',
      effort: 'low',
      maxTokens: 100,
      task: { name: 'proofread' as const, input: {} },
    })
    await expect(final).rejects.toMatchObject({
      code: 'AI_ERROR',
      message: 'AI가 이 요청을 처리하지 않았습니다.',
    })
  })

  it('rejects final with AI_ERROR carrying the billed usage when the stream stops at max_tokens', async () => {
    const { sdk } = stubSdk({ streamStop: 'max_tokens' })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    const { final } = client.streamText({
      system: 's',
      prompt: 'p',
      effort: 'low',
      maxTokens: 100,
      task: { name: 'proofread' as const, input: {} },
    })
    const error = await final.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'AI_ERROR',
      message: 'AI 응답이 너무 길어 중간에 끊겼습니다.',
      details: { usage: { inputTokens: 5, outputTokens: 6 } },
    })
  })

  it('rejects final with AI_ERROR when the stream fails', async () => {
    const { sdk } = stubSdk({ streamError: new Error('network down') })
    const client = new AnthropicAiClient(sdk, 'claude-haiku-5-5')
    const { final } = client.streamText({
      system: 's',
      prompt: 'p',
      effort: 'low',
      maxTokens: 100,
      task: { name: 'proofread' as const, input: {} },
    })
    await expect(final).rejects.toMatchObject({ code: 'AI_ERROR' })
  })
})
