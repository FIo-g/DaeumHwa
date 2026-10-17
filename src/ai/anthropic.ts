import Anthropic, { APIError, AuthenticationError, RateLimitError } from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { AppError } from '@/lib/errors'
import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'

const DEFAULT_MODEL = 'claude-opus-5-5'
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
/** Models that accept server-side fallback on the beta Messages API. */
const FALLBACK_MODELS = new Set([
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
  'claude-sonnet-5-5',
])

const REFUSAL_MESSAGE = 'AI가 이 요청을 처리하지 않았습니다.'
const MAX_TOKENS_MESSAGE = 'AI 응답이 너무 길어 중간에 끊겼습니다.'
const FORMAT_MESSAGE = 'AI 응답 형식이 올바르지 않습니다.'

/** The part of a (beta or non-beta) message stream that streamText uses. */
interface TextStream {
  on(event: 'text', listener: (delta: string) => void): unknown
  finalMessage(): Promise<{
    content: { type: string; text?: string }[]
    stop_reason: string | null
    usage: ResponseUsage
    model: string
  }>
}

type ResponseUsage = { input_tokens: number; output_tokens: number }

type ObjectResponse<T> = {
  parsed_output: T | null
  stop_reason: string | null
  usage: ResponseUsage
  model: string
}

/** Anthropic-backed client. `sdk` can be injected in tests; by default a real SDK client is created. */
export class AnthropicAiClient implements AiClient {
  readonly provider = 'anthropic' as const
  readonly defaultModel: string
  private readonly sdk: Anthropic

  constructor(sdk?: Anthropic, defaultModel?: string) {
    this.sdk = sdk ?? new Anthropic()
    this.defaultModel = defaultModel ?? (process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL)
  }

  async generateObject<T>(args: GenerateObjectArgs<T>) {
    const model = args.model ?? this.defaultModel
    const system = systemBlocks(args.system)
    const messages = [{ role: 'user' as const, content: args.prompt }]
    try {
      if (usesFallback(model)) {
        const response = await this.sdk.beta.messages.parse({
          model,
          max_tokens: args.maxTokens,
          system,
          messages,
          output_config: { format: betaZodOutputFormat(args.schema), effort: args.effort },
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
        })
        return objectResult(response as ObjectResponse<T>)
      }
      const response = await this.sdk.messages.parse({
        model,
        max_tokens: args.maxTokens,
        system,
        messages,
        output_config: { format: zodOutputFormat(args.schema), effort: args.effort },
      })
      return objectResult(response as ObjectResponse<T>)
    } catch (error) {
      throw toAiError(error)
    }
  }

  streamText(args: StreamTextArgs) {
    const model = args.model ?? this.defaultModel
    const channel = new TextChannel()
    const final = this.collectStream(args, model, channel)
    // Errors reach callers through `final` (and through the text stream); this only stops
    // Node from reporting an unhandled rejection when a caller reads just one of them.
    final.catch(() => {})
    return { textStream: channel.iterable(), final }
  }

  private async collectStream(
    args: StreamTextArgs,
    model: string,
    channel: TextChannel,
  ): Promise<{ text: string; usage: AiUsage; model: string }> {
    try {
      const params = {
        model,
        max_tokens: args.maxTokens,
        system: systemBlocks(args.system),
        messages: [{ role: 'user' as const, content: args.prompt }],
        output_config: { effort: args.effort },
      }
      const stream: TextStream = usesFallback(model)
        ? this.sdk.beta.messages.stream({
            ...params,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
          })
        : this.sdk.messages.stream(params)
      stream.on('text', (delta: string) => channel.push(delta))
      const message = await stream.finalMessage()
      assertStopReason(message.stop_reason, message.usage)
      channel.close()
      return {
        text: message.content
          .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
          .join(''),
        usage: usageOf(message.usage),
        model: message.model,
      }
    } catch (error) {
      const aiError = toAiError(error)
      channel.fail(aiError)
      throw aiError
    }
  }
}

function systemBlocks(text: string) {
  return [{ type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } }]
}

function usesFallback(model: string): boolean {
  return FALLBACK_MODELS.has(model)
}

function objectResult<T>(response: ObjectResponse<T>): {
  object: T
  usage: AiUsage
  model: string
} {
  assertStopReason(response.stop_reason, response.usage)
  if (response.parsed_output === null) {
    throw aiErrorWithUsage(FORMAT_MESSAGE, response.usage)
  }
  return {
    object: response.parsed_output,
    usage: usageOf(response.usage),
    model: response.model,
  }
}

function assertStopReason(stopReason: string | null, usage: ResponseUsage): void {
  if (stopReason === 'refusal') throw aiErrorWithUsage(REFUSAL_MESSAGE, usage)
  if (stopReason === 'max_tokens') throw aiErrorWithUsage(MAX_TOKENS_MESSAGE, usage)
}

/**
 * AI_ERROR for a call the API already billed. `details.usage` lets run.ts count those tokens;
 * run.ts strips it before the error reaches the browser.
 */
function aiErrorWithUsage(message: string, usage: ResponseUsage): AppError {
  return new AppError('AI_ERROR', message, { usage: usageOf(usage) })
}

function usageOf(usage: ResponseUsage): AiUsage {
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
}

/** Converts any SDK or unexpected error into the Korean AI_ERROR the app shows. */
function toAiError(error: unknown): AppError {
  if (error instanceof AppError) return error
  let reason: string
  if (error instanceof AuthenticationError) {
    reason = 'API 키가 올바르지 않습니다'
  } else if (error instanceof RateLimitError) {
    reason = '요청이 너무 많습니다'
  } else if (error instanceof APIError && error.status !== undefined) {
    reason = `HTTP ${error.status}`
  } else if (error instanceof Error) {
    reason = error.message
  } else {
    reason = String(error)
  }
  return new AppError('AI_ERROR', `AI 호출에 실패했습니다: ${reason.slice(0, 120)}`)
}

/**
 * Single-consumer buffer that turns push-style text deltas into an async iterable. Text pushed
 * before anyone reads is kept, so a caller may await `final` first and read the text afterwards.
 */
class TextChannel {
  private readonly queue: string[] = []
  private waiter: (() => void) | null = null
  private closed = false
  private failure: { error: unknown } | null = null

  push(text: string): void {
    if (this.closed) return
    this.queue.push(text)
    this.wake()
  }

  close(): void {
    this.closed = true
    this.wake()
  }

  fail(error: unknown): void {
    this.failure = { error }
    this.closed = true
    this.wake()
  }

  iterable(): AsyncIterable<string> {
    return this.drain()
  }

  private async *drain(): AsyncGenerator<string> {
    for (;;) {
      const next = this.queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (this.closed) {
        if (this.failure) throw this.failure.error
        return
      }
      await new Promise<void>((resolve) => {
        this.waiter = resolve
      })
    }
  }

  private wake(): void {
    const waiter = this.waiter
    this.waiter = null
    waiter?.()
  }
}
