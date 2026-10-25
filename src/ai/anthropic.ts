import Anthropic, {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  RateLimitError,
} from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { AppError } from '@/lib/errors'
import { providerDefaultModel } from '@/ai/models'
import {
  AI_CANCELLED_MESSAGE,
  AI_TIMEOUT_MESSAGE,
  type AiClient,
  type AiUsage,
  type GenerateObjectArgs,
  type StreamTextArgs,
} from '@/ai/types'

const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
/** Models that accept server-side fallback on the beta Messages API. */
const FALLBACK_MODELS = new Set([
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
  'claude-sonnet-5-5',
])

export const REFUSAL_MESSAGE = 'AI가 이 요청을 처리하지 않았습니다.'
export const MAX_TOKENS_MESSAGE = 'AI 응답이 너무 길어 중간에 끊겼습니다.'
export const FORMAT_MESSAGE = 'AI 응답 형식이 올바르지 않습니다.'
const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0 }

export interface AnthropicClientOptions {
  /** Label reported as `provider`. OpenCode Go reuses this client with its own label. */
  provider?: 'anthropic' | 'opencode'
  /** Send server-side fallback for Opus-class models. Off for gateways that do not support it. */
  serverFallback?: boolean
  /**
   * Gateway fallback for output_config. Structured calls then go through messages.create and the
   * answer text is parsed here, so a gateway that rejects output_config (a 400) or ignores it (a
   * prose answer) is seen with its billed usage. Each such model gets one plain-JSON retry, marked
   * for JSON mode only after that retry succeeds. A stream rejected for output_config (effort) is
   * retried once without it.
   */
  jsonFallback?: boolean
  /** Models known to lack structured output. They use JSON mode from the first call. */
  jsonModels?: readonly string[]
}

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

type ResponseUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

type ObjectResponse<T> = {
  parsed_output: T | null
  stop_reason: string | null
  usage: ResponseUsage
  model: string
}

type ObjectResult<T> = { object: T; usage: AiUsage; model: string }

/** The API billed a structured answer that was not valid JSON for the schema. Triggers the JSON retry. */
class UnstructuredAnswer extends Error {
  readonly usage: AiUsage

  constructor(usage: AiUsage) {
    super('Structured answer did not match the schema')
    this.name = 'UnstructuredAnswer'
    this.usage = usage
  }
}

/** Anthropic-backed client. `sdk` can be injected in tests; by default a real SDK client is created. */
export class AnthropicAiClient implements AiClient {
  readonly provider: 'anthropic' | 'opencode'
  readonly defaultModel: string
  private readonly sdk: Anthropic
  private readonly serverFallback: boolean
  private readonly jsonFallback: boolean
  /** Models that use JSON mode on this client instance. */
  private readonly jsonModels: Set<string>
  /** Models whose stream rejected output_config (effort); they stream without it. */
  private readonly streamPlainModels = new Set<string>()

  constructor(sdk?: Anthropic, defaultModel?: string, options: AnthropicClientOptions = {}) {
    this.provider = options.provider ?? 'anthropic'
    this.sdk = sdk ?? createAnthropicSdk()
    this.defaultModel = defaultModel ?? providerDefaultModel('anthropic')
    this.serverFallback = options.serverFallback ?? true
    this.jsonFallback = options.jsonFallback ?? false
    this.jsonModels = new Set(options.jsonModels ?? [])
  }

  async generateObject<T>(args: GenerateObjectArgs<T>): Promise<ObjectResult<T>> {
    const model = args.model ?? this.defaultModel
    if (this.jsonModels.has(model)) return this.generateObjectAsJson(args, model, NO_USAGE)
    try {
      return await this.generateObjectStructured(args, model)
    } catch (error) {
      if (!this.jsonFallback || !isStructuredOutputRejection(error))
        throw toAiError(error, NO_USAGE, args)
      const billed = error instanceof UnstructuredAnswer ? error.usage : NO_USAGE
      const result = await this.generateObjectAsJson(args, model, billed)
      this.jsonModels.add(model)
      return result
    }
  }

  /** Structured output through the SDK parse helpers. Errors are returned raw for the caller to map. */
  private async generateObjectStructured<T>(
    args: GenerateObjectArgs<T>,
    model: string,
  ): Promise<ObjectResult<T>> {
    if (this.jsonFallback) return this.structuredThroughCreate(args, model)
    const system = systemBlocks(args.system)
    const messages = [{ role: 'user' as const, content: userContent(args) }]
    if (this.usesServerFallback(model)) {
      const response = await this.sdk.beta.messages.parse(
        {
          model,
          max_tokens: args.maxTokens,
          system,
          messages,
          output_config: { format: betaZodOutputFormat(args.schema), effort: args.effort },
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
        },
        requestOptions(args),
      )
      return objectResult(response as ObjectResponse<T>)
    }
    const response = await this.sdk.messages.parse(
      {
        model,
        max_tokens: args.maxTokens,
        system,
        messages,
        output_config: { format: zodOutputFormat(args.schema), effort: args.effort },
      },
      requestOptions(args),
    )
    return objectResult(response as ObjectResponse<T>)
  }

  /**
   * Structured output for gateways that may ignore output_config. The answer text is parsed here,
   * so a prose or off-schema answer arrives with its billed usage and goes to the JSON retry.
   */
  private async structuredThroughCreate<T>(
    args: GenerateObjectArgs<T>,
    model: string,
  ): Promise<ObjectResult<T>> {
    const response = await this.sdk.messages.create(
      {
        model,
        max_tokens: args.maxTokens,
        system: systemBlocks(args.system),
        messages: [{ role: 'user' as const, content: userContent(args) }],
        output_config: { format: zodOutputFormat(args.schema), effort: args.effort },
      },
      requestOptions(args),
    )
    const usage = usageOf(response.usage)
    assertStopReason(response.stop_reason, usage)
    const checked = safeParseAnswer(args.schema, textOf(response.content))
    if (!checked.success) throw new UnstructuredAnswer(usage)
    return { object: checked.data, usage, model: response.model }
  }

  /**
   * Plain-text JSON mode for gateways that do not forward output_config. No output_config and
   * no fallbacks are sent; the first JSON object in the answer is parsed and schema-checked.
   * `billed` is usage from earlier attempts for the same call, so it is counted here too.
   */
  private async generateObjectAsJson<T>(
    args: GenerateObjectArgs<T>,
    model: string,
    billed: AiUsage,
  ): Promise<ObjectResult<T>> {
    try {
      const response = await this.sdk.messages.create(
        {
          model,
          max_tokens: args.maxTokens,
          system: systemBlocks(args.system),
          messages: [
            {
              role: 'user' as const,
              content: userContent(args, `\n\n${jsonInstruction(args.schema)}`),
            },
          ],
        },
        requestOptions(args),
      )
      const usage = addUsage(billed, usageOf(response.usage))
      assertStopReason(response.stop_reason, usage)
      const checked = safeParseAnswer(args.schema, textOf(response.content))
      if (!checked.success) throw aiErrorWithUsage(FORMAT_MESSAGE, usage)
      return { object: checked.data, usage, model: response.model }
    } catch (error) {
      throw toAiError(error, billed, args)
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
    const sendEffort = !(this.jsonFallback && this.streamPlainModels.has(model))
    try {
      return await this.streamOnce(args, model, channel, sendEffort)
    } catch (error) {
      // Only before any text reached the caller, so the retry cannot repeat output.
      if (
        this.jsonFallback &&
        sendEffort &&
        !channel.started &&
        isStructuredOutputRejection(error)
      ) {
        try {
          const result = await this.streamOnce(args, model, channel, false)
          this.streamPlainModels.add(model)
          return result
        } catch (retryError) {
          return this.failStream(channel, retryError, args)
        }
      }
      return this.failStream(channel, error, args)
    }
  }

  private async streamOnce(
    args: StreamTextArgs,
    model: string,
    channel: TextChannel,
    sendEffort: boolean,
  ): Promise<{ text: string; usage: AiUsage; model: string }> {
    const params = {
      model,
      max_tokens: args.maxTokens,
      system: systemBlocks(args.system),
      messages: [{ role: 'user' as const, content: userContent(args) }],
      ...(sendEffort ? { output_config: { effort: args.effort } } : {}),
    }
    const options = requestOptions(args)
    const stream: TextStream = this.usesServerFallback(model)
      ? this.sdk.beta.messages.stream(
          {
            ...params,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
          },
          options,
        )
      : this.sdk.messages.stream(params, options)
    stream.on('text', (delta: string) => channel.push(delta))
    const message = await stream.finalMessage()
    const usage = usageOf(message.usage)
    assertStopReason(message.stop_reason, usage)
    channel.close()
    return {
      text: textOf(message.content),
      usage,
      model: message.model,
    }
  }

  private failStream(channel: TextChannel, error: unknown, args: StreamTextArgs): never {
    const aiError = toAiError(error, NO_USAGE, args)
    channel.fail(aiError)
    throw aiError
  }

  private usesServerFallback(model: string): boolean {
    return this.serverFallback && FALLBACK_MODELS.has(model)
  }
}

/** SDK client with one retry at most, so a stalled call cannot hold a request for minutes. */
export function createAnthropicSdk(): Anthropic {
  return new Anthropic({ maxRetries: 1 })
}

/**
 * Per-request options for the SDK. The SDK's own `timeout` clears once response headers arrive,
 * so it does not bound a streamed or slow body. The signal therefore joins the caller's cancel
 * with a time limit that covers the whole request, body included. Unset values are left out.
 */
function requestOptions(args: { signal?: AbortSignal; timeoutMs?: number }) {
  const timeoutSignal =
    args.timeoutMs !== undefined ? AbortSignal.timeout(args.timeoutMs) : undefined
  const signal =
    args.signal && timeoutSignal
      ? AbortSignal.any([args.signal, timeoutSignal])
      : (args.signal ?? timeoutSignal)
  return {
    ...(signal ? { signal } : {}),
    ...(args.timeoutMs !== undefined ? { timeout: args.timeoutMs } : {}),
  }
}

/**
 * `AI_CACHE_TTL` set to `1h` keeps cached prompt blocks for an hour instead of the
 * default five minutes. Anything else (including unset) keeps today's object.
 */
export function anthropicCacheControl(): { type: 'ephemeral'; ttl?: '1h' } {
  if (process.env.AI_CACHE_TTL?.trim() === '1h') return { type: 'ephemeral', ttl: '1h' }
  return { type: 'ephemeral' }
}

export function systemBlocks(text: string) {
  return [{ type: 'text' as const, text, cache_control: anthropicCacheControl() }]
}

/**
 * User message content. Without a prefix it is the plain text. With one, each prefix block gets a
 * cache mark and the prompt comes last; `tail` (the JSON instruction in JSON mode) joins the prompt.
 */
export function userContent(
  args: { prompt: string; promptPrefix?: string[] },
  tail = '',
): string | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[] {
  const text = `${args.prompt}${tail}`
  if (!args.promptPrefix?.length) return text
  return [
    ...args.promptPrefix.map((block) => ({
      type: 'text' as const,
      text: block,
      cache_control: anthropicCacheControl(),
    })),
    { type: 'text' as const, text },
  ]
}

/**
 * True when the gateway rejected the structured-output or effort parameters: a 400 naming them,
 * or an answer that was billed but did not match the schema (a gateway that ignored output_config).
 */
const REJECTED_PARAMETER = /output_config|json[ _]schema|response_format|output_format|effort/i

function isStructuredOutputRejection(error: unknown): boolean {
  if (error instanceof UnstructuredAnswer) return true
  return error instanceof APIError && error.status === 400 && REJECTED_PARAMETER.test(error.message)
}

/** Instruction appended to the prompt in JSON mode; the schema is derived from the zod schema. */
export function jsonInstruction(schema: z.ZodType): string {
  return [
    'Respond with only one JSON object that matches this JSON Schema.',
    'Do not add explanations or code fences.',
    JSON.stringify(z.toJSONSchema(schema)),
  ].join('\n')
}

function textOf(content: { type: string; text?: string }[]): string {
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('')
}

/** Parses the first JSON object in `text` and checks it against the schema. */
export function safeParseAnswer<T>(
  schema: z.ZodType<T>,
  text: string,
): { success: true; data: T } | { success: false } {
  const value = parseJsonObject(text)
  if (value === undefined) return { success: false }
  const checked = schema.safeParse(value)
  return checked.success ? { success: true, data: checked.data } : { success: false }
}

/** Returns the first balanced JSON object in `text`, or undefined when there is none or it is invalid. */
function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  if (start === -1) return undefined
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as unknown
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

function objectResult<T>(response: ObjectResponse<T>): ObjectResult<T> {
  const usage = usageOf(response.usage)
  assertStopReason(response.stop_reason, usage)
  if (response.parsed_output === null) {
    throw aiErrorWithUsage(FORMAT_MESSAGE, usage)
  }
  return {
    object: response.parsed_output,
    usage,
    model: response.model,
  }
}

function assertStopReason(stopReason: string | null, usage: AiUsage): void {
  if (stopReason === 'refusal') throw aiErrorWithUsage(REFUSAL_MESSAGE, usage)
  if (stopReason === 'max_tokens') throw aiErrorWithUsage(MAX_TOKENS_MESSAGE, usage)
}

/**
 * AI_ERROR for a call the API already billed. `details.usage` lets run.ts count those tokens;
 * run.ts strips it before the error reaches the browser.
 */
function aiErrorWithUsage(message: string, usage: AiUsage): AppError {
  return new AppError('AI_ERROR', message, { usage })
}

/**
 * Anthropic reports cached input apart from `input_tokens`. Cache reads and writes are added to
 * the input total, and each cache key is set only when the response carried it (0 included).
 */
function usageOf(usage: ResponseUsage): AiUsage {
  const cacheRead = usage.cache_read_input_tokens
  const cacheWrite = usage.cache_creation_input_tokens
  const result: AiUsage = {
    inputTokens:
      usage.input_tokens +
      (typeof cacheRead === 'number' ? cacheRead : 0) +
      (typeof cacheWrite === 'number' ? cacheWrite : 0),
    outputTokens: usage.output_tokens,
  }
  if (typeof cacheRead === 'number') result.cacheReadTokens = cacheRead
  if (typeof cacheWrite === 'number') result.cacheWriteTokens = cacheWrite
  return result
}

function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  const result: AiUsage = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
  const cacheRead = sumCache(a.cacheReadTokens, b.cacheReadTokens)
  const cacheWrite = sumCache(a.cacheWriteTokens, b.cacheWriteTokens)
  if (cacheRead !== undefined) result.cacheReadTokens = cacheRead
  if (cacheWrite !== undefined) result.cacheWriteTokens = cacheWrite
  return result
}

/** Sum of two optional cache counts; undefined when neither side has the key. */
function sumCache(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined
  return (a ?? 0) + (b ?? 0)
}

/**
 * Converts any SDK or unexpected error into the Korean AI_ERROR the app shows. `billed` is usage
 * from earlier attempts of the same call; it is attached so run.ts still counts it. `call` is the
 * caller's signal and time limit: an abort the caller did not send, on a call that has a time
 * limit, can only come from that limit, so it maps to the timeout message.
 */
function toAiError(
  error: unknown,
  billed: AiUsage = NO_USAGE,
  call?: { signal?: AbortSignal; timeoutMs?: number },
): AppError {
  if (error instanceof AppError) return error
  const billedAny = billed.inputTokens > 0 || billed.outputTokens > 0
  if (error instanceof APIUserAbortError || isAbortError(error)) {
    const timedOut = call?.timeoutMs !== undefined && !call.signal?.aborted
    if (timedOut) {
      return new AppError('AI_ERROR', AI_TIMEOUT_MESSAGE, billedAny ? { usage: billed } : undefined)
    }
    return new AppError(
      'CANCELLED',
      AI_CANCELLED_MESSAGE,
      billedAny ? { usage: billed } : undefined,
    )
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new AppError('AI_ERROR', AI_TIMEOUT_MESSAGE, billedAny ? { usage: billed } : undefined)
  }
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
  return new AppError(
    'AI_ERROR',
    `AI 호출에 실패했습니다: ${reason.slice(0, 120)}`,
    billedAny ? { usage: billed } : undefined,
  )
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Single-consumer buffer that turns push-style text deltas into an async iterable. Text pushed
 * before anyone reads is kept, so a caller may await `final` first and read the text afterwards.
 */
export class TextChannel {
  private readonly queue: string[] = []
  private waiter: (() => void) | null = null
  private closed = false
  private failure: { error: unknown } | null = null
  private pushed = false

  /** True once any text was pushed. */
  get started(): boolean {
    return this.pushed
  }

  push(text: string): void {
    if (this.closed) return
    this.pushed = true
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
