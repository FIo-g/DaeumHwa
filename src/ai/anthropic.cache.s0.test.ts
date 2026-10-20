import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { AnthropicAiClient } from '@/ai/anthropic'

const OutputSchema = z.object({ answer: z.string() })

type Usage = Record<string, number>

/** Stub SDK: messages.parse returns `usage`; the stream's final message carries the same usage. */
function stubSdk(usage: Usage) {
  const sdk = {
    messages: {
      parse: async () => ({
        parsed_output: { answer: '네' },
        stop_reason: 'end_turn',
        usage,
        model: 'claude-haiku-5-5',
        content: [],
      }),
      stream: () => {
        let handler: ((delta: string) => void) | undefined
        const stream = {
          on(event: string, listener: (delta: string) => void) {
            if (event === 'text') handler = listener
            return stream
          },
          finalMessage: async () => {
            handler?.('네')
            return {
              content: [{ type: 'text', text: '네' }],
              stop_reason: 'end_turn',
              usage,
              model: 'claude-haiku-5-5',
            }
          },
        }
        return stream
      },
    },
  }
  return sdk as unknown as Anthropic
}

const baseArgs = {
  system: '시스템 지시',
  prompt: '질문',
  schema: OutputSchema,
  effort: 'medium' as const,
  maxTokens: 1000,
  task: { name: 'proofread' as const, input: {} },
}

const streamArgs = {
  system: '시스템 지시',
  prompt: '질문',
  effort: 'medium' as const,
  maxTokens: 1000,
  task: { name: 'proofread' as const, input: {} },
}

describe('AnthropicAiClient cache usage', () => {
  it('adds cache reads and writes to input tokens', async () => {
    const client = new AnthropicAiClient(
      stubSdk({
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 300,
      }),
      'claude-haiku-5-5',
    )
    const result = await client.generateObject(baseArgs)
    expect(result.usage).toEqual({
      inputTokens: 1300,
      outputTokens: 50,
      cacheReadTokens: 900,
      cacheWriteTokens: 300,
    })
  })

  it('adds cache reads and writes to input tokens on a stream final message', async () => {
    const client = new AnthropicAiClient(
      stubSdk({
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 300,
      }),
      'claude-haiku-5-5',
    )
    const stream = client.streamText(streamArgs)
    for await (const _chunk of stream.textStream) void _chunk
    const result = await stream.final
    expect(result.usage).toEqual({
      inputTokens: 1300,
      outputTokens: 50,
      cacheReadTokens: 900,
      cacheWriteTokens: 300,
    })
  })

  it('keeps the old shape without cache fields', async () => {
    const client = new AnthropicAiClient(
      stubSdk({ input_tokens: 100, output_tokens: 50 }),
      'claude-haiku-5-5',
    )
    const result = await client.generateObject(baseArgs)
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
  })
})
