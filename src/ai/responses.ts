import { z } from 'zod'
import { AppError } from '@/lib/errors'
import {
  FORMAT_MESSAGE,
  MAX_TOKENS_MESSAGE,
  REFUSAL_MESSAGE,
  TextChannel,
  jsonInstruction,
  safeParseAnswer,
} from '@/ai/anthropic'
import type { AiClient, AiEffort, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'

const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0 }
const FORMAT_NAME = 'daeumhwa_answer'
/** A 400 that names the structured-output parameter. Triggers one JSON-mode retry. */
const FORMAT_REJECTED = /text\.format|json_schema|response_format/i
/** A 400 that names reasoning. Triggers one retry without reasoning. */
const REASONING_REJECTED = /reasoning|effort/i
/** Retries for transient failures (408, 409, 429, 5xx, network), same count as the Anthropic SDK. */
const MAX_RETRIES = 2
const DEFAULT_TIMEOUT_MS = 240_000
const DEFAULT_RETRY_BASE_MS = 500
const MAX_RETRY_DELAY_MS = 20_000

export interface ResponsesClientOptions {
  /** Base URL that `/responses` is appended to, e.g. https://opencode.ai/inference/go/openai/v1. */
  baseUrl: string
  /** Sent as `Authorization: Bearer`. Omitted when null. */
  apiKey: string | null
  /** Extra headers, such as the OpenCode session id and User-Agent. */
  headers?: Record<string, string>
  /** Injected in tests. Defaults to the global fetch. */
  fetch?: typeof fetch
  defaultModel: string
  /** Timeout per attempt in ms. Covers the whole request, including a streamed answer. */
  timeoutMs?: number
  /** Base backoff in ms between retries. Tests set 0. */
  retryBaseDelayMs?: number
}

type Mode = { json: boolean; reasoning: boolean }

type ObjectResult<T> = { object: T; usage: AiUsage; model: string }

type OutputContent = { type: string; text?: string }
type OutputItem = { type: string; content?: OutputContent[] }
type ResponseBody = {
  model?: string
  status?: string
  incomplete_details?: { reason?: string } | null
  output?: OutputItem[]
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { message?: string } | null
}

/** The gateway answered with a non-2xx status. Carries the status and the server's message. */
class HttpRejection extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(`HTTP ${status}`)
    this.name = 'HttpRejection'
    this.status = status
    this.detail = detail
  }
}

/** The API billed an answer that was not valid JSON for the schema. Triggers the JSON retry. */
class UnstructuredAnswer extends Error {
  readonly usage: AiUsage

  constructor(usage: AiUsage) {
    super('Structured answer did not match the schema')
    this.name = 'UnstructuredAnswer'
    this.usage = usage
  }
}

/**
 * Client for the OpenAI Responses format (`POST {baseUrl}/responses`). Same contract as
 * AnthropicAiClient: structured output with a JSON-mode and no-reasoning fallback per model,
 * Korean AI_ERROR messages, and billed usage on errors.
 */
export class ResponsesAiClient implements AiClient {
  readonly provider = 'opencode' as const
  readonly defaultModel: string
  private readonly baseUrl: string
  private readonly apiKey: string | null
  private readonly headers: Record<string, string>
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly retryBaseDelayMs: number
  /** Models that use JSON mode on this client instance (after a successful retry). */
  private readonly jsonModels = new Set<string>()
  /** Models that reject reasoning; they are called without it (after a successful retry). */
  private readonly plainModels = new Set<string>()

  constructor(options: ResponsesClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.apiKey = options.apiKey
    this.headers = options.headers ?? {}
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    this.defaultModel = options.defaultModel
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_MS
  }

  async generateObject<T>(args: GenerateObjectArgs<T>): Promise<ObjectResult<T>> {
    const model = args.model ?? this.defaultModel
    const initial: Mode = {
      json: this.jsonModels.has(model),
      reasoning: !this.plainModels.has(model),
    }
    let mode = initial
    let billed: AiUsage = NO_USAGE
    for (;;) {
      try {
        const result = await this.send(args, model, mode)
        // Remember a fallback only after the retry that used it succeeded.
        if (mode.json && !initial.json) this.jsonModels.add(model)
        if (!mode.reasoning && initial.reasoning) this.plainModels.add(model)
        return { ...result, usage: addUsage(billed, result.usage) }
      } catch (error) {
        billed = addUsage(billed, attemptUsage(error))
        const next = nextMode(error, mode)
        if (!next) throw failure(error, billed)
        mode = next
      }
    }
  }

  streamText(args: StreamTextArgs) {
    const model = args.model ?? this.defaultModel
    const channel = new TextChannel()
    const final = this.collectStream(args, model, channel)
    // Errors reach callers through `final` and the text stream; this only stops an unhandled
    // rejection when a caller reads just one of them.
    final.catch(() => {})
    return { textStream: channel.iterable(), final }
  }

  private async send<T>(
    args: GenerateObjectArgs<T>,
    model: string,
    mode: Mode,
  ): Promise<ObjectResult<T>> {
    const body = this.requestBody(
      mode.json ? `${args.prompt}\n\n${jsonInstruction(args.schema)}` : args.prompt,
      args,
      model,
      mode,
    )
    if (!mode.json) {
      body.text = {
        format: {
          type: 'json_schema',
          name: FORMAT_NAME,
          schema: toStrictJsonSchema(z.toJSONSchema(args.schema)),
          strict: true,
        },
      }
    }
    const response = await this.post(body)
    const json = (await response.json()) as ResponseBody
    const usage = usageOf(json.usage)
    assertFinished(json, usage)
    const checked = safeParseAnswer(args.schema, textOf(json.output))
    if (!checked.success) throw new UnstructuredAnswer(usage)
    return { object: checked.data, usage, model: json.model ?? model }
  }

  private requestBody(
    input: string,
    args: { system: string; maxTokens: number; effort: AiEffort },
    model: string,
    mode: Mode,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      instructions: args.system,
      input: [{ role: 'user', content: [{ type: 'input_text', text: input }] }],
      max_output_tokens: args.maxTokens,
      store: false,
    }
    if (mode.reasoning) body.reasoning = { effort: reasoningEffortFor(args.effort) }
    return body
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      ...this.headers,
    }
    const payload = JSON.stringify(body)
    // Retries happen only here, before any answer body is read, so no stream text can repeat.
    for (let attempt = 0; ; attempt++) {
      const retriesLeft = attempt < MAX_RETRIES
      let response: Response
      try {
        response = await this.fetchImpl(`${this.baseUrl}/responses`, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(this.timeoutMs),
        })
      } catch (error) {
        if (retriesLeft && error instanceof TypeError) {
          await sleep(retryDelayMs(undefined, attempt, this.retryBaseDelayMs))
          continue
        }
        throw error
      }
      if (response.ok) return response
      if (retriesLeft && isRetryableStatus(response.status)) {
        await response.body?.cancel().catch(() => undefined)
        await sleep(retryDelayMs(response, attempt, this.retryBaseDelayMs))
        continue
      }
      throw await httpRejection(response)
    }
  }

  private async collectStream(
    args: StreamTextArgs,
    model: string,
    channel: TextChannel,
  ): Promise<{ text: string; usage: AiUsage; model: string }> {
    const withReasoning = !this.plainModels.has(model)
    try {
      return await this.streamOnce(args, model, channel, withReasoning)
    } catch (error) {
      // Only before any text reached the caller, so the retry cannot repeat output.
      if (withReasoning && !channel.started && isReasoningRejection(error)) {
        try {
          const result = await this.streamOnce(args, model, channel, false)
          this.plainModels.add(model)
          return result
        } catch (retryError) {
          return this.failStream(channel, retryError)
        }
      }
      return this.failStream(channel, error)
    }
  }

  private async streamOnce(
    args: StreamTextArgs,
    model: string,
    channel: TextChannel,
    withReasoning: boolean,
  ): Promise<{ text: string; usage: AiUsage; model: string }> {
    const body = this.requestBody(args.prompt, args, model, {
      json: false,
      reasoning: withReasoning,
    })
    body.stream = true
    const response = await this.post(body)
    if (!response.body) throw new Error('응답 본문이 비어 있습니다')

    let text = ''
    let final: ResponseBody | undefined
    for await (const event of serverSentEvents(response.body)) {
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        text += event.delta
        channel.push(event.delta)
      } else if (
        event.type === 'response.completed' ||
        event.type === 'response.incomplete' ||
        event.type === 'response.failed'
      ) {
        final = event.response as ResponseBody
      } else if (event.type === 'error') {
        throw new Error(typeof event.message === 'string' ? event.message : '스트림 오류')
      }
    }
    if (!final) throw new Error('응답이 끝나기 전에 스트림이 끊겼습니다')
    const usage = usageOf(final.usage)
    assertFinished(final, usage)
    channel.close()
    return { text: text || textOf(final.output), usage, model: final.model ?? model }
  }

  private failStream(channel: TextChannel, error: unknown): never {
    const aiError = failure(error, attemptUsage(error))
    channel.fail(aiError)
    throw aiError
  }
}

/** Maps OpenCode Go effort levels to the Responses reasoning effort. xhigh and max become high. */
export function reasoningEffortFor(effort: AiEffort): 'low' | 'medium' | 'high' {
  if (effort === 'low') return 'low'
  if (effort === 'medium') return 'medium'
  return 'high'
}

/**
 * Converts a zod JSON Schema to the subset strict mode accepts: every object is closed
 * (additionalProperties false) and lists all its keys as required. `$schema` is dropped.
 * Nullable unions and other keywords are kept as they are.
 */
export function toStrictJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictJsonSchema)
  if (!isRecord(node)) return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema') continue
    if ((key === 'properties' || key === '$defs' || key === 'definitions') && isRecord(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, schema]) => [name, toStrictJsonSchema(schema)]),
      )
    } else {
      out[key] = toStrictJsonSchema(value)
    }
  }
  if (isObjectSchema(out)) {
    const properties = isRecord(out.properties) ? out.properties : {}
    out.additionalProperties = false
    out.required = Object.keys(properties)
  }
  return out
}

function isObjectSchema(node: Record<string, unknown>): boolean {
  if (node.type === 'object') return true
  if (Array.isArray(node.type) && node.type.includes('object')) return true
  return node.properties !== undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Throws when the response did not finish with a usable answer. Billed usage is attached. */
function assertFinished(body: ResponseBody, usage: AiUsage): void {
  if (body.status === 'incomplete') {
    if (body.incomplete_details?.reason === 'content_filter') {
      throw aiErrorWithUsage(REFUSAL_MESSAGE, usage)
    }
    throw aiErrorWithUsage(MAX_TOKENS_MESSAGE, usage)
  }
  if (body.status === 'failed') {
    const reason = body.error?.message ?? '알 수 없는 오류'
    throw aiErrorWithUsage(`AI 호출에 실패했습니다: ${reason}`, usage)
  }
  if (hasRefusal(body.output)) throw aiErrorWithUsage(REFUSAL_MESSAGE, usage)
}

function hasRefusal(output: OutputItem[] | undefined): boolean {
  return (output ?? []).some((item) => (item.content ?? []).some((part) => part.type === 'refusal'))
}

/** Text of the message items only; reasoning items carry no answer text. */
function textOf(output: OutputItem[] | undefined): string {
  return (output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .map((part) => (part.type === 'output_text' ? (part.text ?? '') : ''))
    .join('')
}

function usageOf(usage: ResponseBody['usage']): AiUsage {
  return { inputTokens: usage?.input_tokens ?? 0, outputTokens: usage?.output_tokens ?? 0 }
}

function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
}

/** Usage billed by one failed attempt, so the retry counts still include it. */
function attemptUsage(error: unknown): AiUsage {
  if (error instanceof UnstructuredAnswer) return error.usage
  if (error instanceof AppError && isRecord(error.details) && isUsage(error.details.usage)) {
    return error.details.usage
  }
  return NO_USAGE
}

function isUsage(value: unknown): value is AiUsage {
  return (
    isRecord(value) &&
    typeof value.inputTokens === 'number' &&
    typeof value.outputTokens === 'number'
  )
}

/** Decides the retry for a failed attempt, or null when the error is final. */
function nextMode(error: unknown, mode: Mode): Mode | null {
  if (error instanceof UnstructuredAnswer) return mode.json ? null : { ...mode, json: true }
  if (error instanceof HttpRejection && error.status === 400) {
    if (!mode.json && FORMAT_REJECTED.test(error.detail)) return { ...mode, json: true }
    if (mode.reasoning && REASONING_REJECTED.test(error.detail)) {
      return { ...mode, reasoning: false }
    }
  }
  return null
}

function isReasoningRejection(error: unknown): boolean {
  return (
    error instanceof HttpRejection && error.status === 400 && REASONING_REJECTED.test(error.detail)
  )
}

async function httpRejection(response: Response): Promise<HttpRejection> {
  const text = await response.text().catch(() => '')
  let detail = text.slice(0, 300)
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } | unknown }
    const message = isRecord(parsed.error) ? parsed.error.message : undefined
    if (typeof message === 'string') detail = message
  } catch {
    // Not JSON: keep the raw text as the detail.
  }
  return new HttpRejection(response.status, detail)
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

/**
 * Wait before the next attempt: Retry-After (seconds, or an HTTP date) when the gateway sent one,
 * else exponential backoff from `baseMs`. Capped so a long Retry-After cannot stall the request.
 */
export function retryDelayMs(
  response: Response | undefined,
  attempt: number,
  baseMs: number,
): number {
  const header = response?.headers.get('retry-after')?.trim()
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS)
    const date = Date.parse(header)
    if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_DELAY_MS)
  }
  return Math.min(baseMs * 2 ** attempt, MAX_RETRY_DELAY_MS)
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

/**
 * Converts any error into the Korean AI_ERROR the app shows. `billed` is usage from every attempt
 * of the call, so run.ts still counts tokens the API already charged.
 */
function failure(error: unknown, billed: AiUsage): AppError {
  if (error instanceof AppError) return aiErrorWithUsage(error.message, billed)
  if (error instanceof UnstructuredAnswer) return aiErrorWithUsage(FORMAT_MESSAGE, billed)
  return aiErrorWithUsage(`AI 호출에 실패했습니다: ${reasonOf(error).slice(0, 120)}`, billed)
}

function reasonOf(error: unknown): string {
  if (error instanceof HttpRejection) {
    if (error.status === 401 || error.status === 403) return 'API 키가 올바르지 않습니다'
    if (error.status === 429) return '요청이 너무 많습니다'
    return error.message
  }
  if (isRecord(error) && error.name === 'TimeoutError') return '응답 시간이 초과되었습니다'
  if (error instanceof Error) return error.message
  return String(error)
}

function aiErrorWithUsage(message: string, usage: AiUsage): AppError {
  const billed = usage.inputTokens > 0 || usage.outputTokens > 0
  return new AppError('AI_ERROR', message, billed ? { usage } : undefined)
}

/** Parses `data:` lines of a server-sent event stream. Events are split on blank lines. */
async function* serverSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      let end = buffer.indexOf('\n\n')
      while (end !== -1) {
        const event = parseEvent(buffer.slice(0, end))
        buffer = buffer.slice(end + 2)
        if (event) yield event
        end = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    const last = parseEvent(buffer)
    if (last) yield last
  } finally {
    // Runs when the consumer stops early (an error event, bad JSON, or a return): the HTTP body
    // is cancelled so the socket is released instead of held until the server closes it.
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

function parseEvent(block: string): Record<string, unknown> | undefined {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
  if (data === '' || data === '[DONE]') return undefined
  const parsed: unknown = JSON.parse(data)
  return isRecord(parsed) ? parsed : undefined
}
