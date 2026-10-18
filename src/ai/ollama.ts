import { z } from 'zod'
import {
  FORMAT_MESSAGE,
  MAX_TOKENS_MESSAGE,
  TextChannel,
  jsonInstruction,
  safeParseAnswer,
} from '@/ai/anthropic'
import {
  AI_CANCELLED_MESSAGE,
  AI_TIMEOUT_MESSAGE,
  type AiClient,
  type AiUsage,
  type GenerateObjectArgs,
  type StreamTextArgs,
} from '@/ai/types'
import { AppError } from '@/lib/errors'

export type OllamaThink = boolean | 'low' | 'medium' | 'high'

export interface OllamaOptions {
  model: string
  numCtx: number
  /** Defaults to OLLAMA_BASE_URL, then http://127.0.0.1:11434. */
  baseUrl?: string
  temperature?: number
  topP?: number
  topK?: number
  minP?: number
  think?: OllamaThink
  /** How long Ollama keeps the model loaded after a call. Defaults to '30m'. */
  keepAlive?: string
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch
}

/** Non-2xx answer from the Ollama server. Passed through unchanged, not wrapped as AppError. */
export class OllamaHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Ollama request failed with HTTP ${status}`)
    this.name = 'OllamaHttpError'
    this.status = status
  }
}

type ChatMessage = { role: 'system' | 'user'; content: string }

/** The fields of an /api/chat answer (one object, or one NDJSON line when streaming). */
type ChatResponse = {
  model?: string
  message?: { content?: string }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
}

type ObjectResult<T> = { object: T; usage: AiUsage; model: string }

/** Caller's cancel signal and time limit, shared by every request of one call. */
type CallLimits = { signal?: AbortSignal; timeoutMs?: number }

type ChatResult = { content: string; usage: AiUsage; model: string; doneReason?: string }

const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0 }
const THINK_OPEN = '<think>'
const LEADING_THINK = /^\s*<think>[\s\S]*?<\/think>\s*/

/** Removes a think block at the start of a model answer. Text without one is returned unchanged. */
export function stripThink(text: string): string {
  return text.replace(LEADING_THINK, '')
}

/**
 * Local Ollama client (/api/chat). Structured calls use one schema-constrained attempt, then one
 * plain JSON retry with jsonInstruction, the same policy as AnthropicAiClient's jsonFallback path.
 */
export class OllamaAiClient implements AiClient {
  readonly provider = 'ollama'
  readonly defaultModel: string
  private readonly settings: OllamaOptions
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: OllamaOptions) {
    this.settings = options
    this.defaultModel = options.model
    this.baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'
    this.fetchImpl = options.fetch ?? fetch
  }

  async generateObject<T>(args: GenerateObjectArgs<T>): Promise<ObjectResult<T>> {
    const model = args.model ?? this.defaultModel
    const call: CallLimits = { signal: args.signal, timeoutMs: args.timeoutMs }
    const system: ChatMessage = { role: 'system', content: args.system }
    let billed = NO_USAGE
    try {
      const first = await this.chat({
        model,
        messages: [system, { role: 'user', content: args.prompt }],
        format: z.toJSONSchema(args.schema),
        maxTokens: args.maxTokens,
        call,
      })
      billed = first.usage
      assertComplete(first.doneReason, billed)
      const checked = safeParseAnswer(args.schema, stripThink(first.content))
      if (checked.success) return { object: checked.data, usage: billed, model: first.model }

      const retry = await this.chat({
        model,
        messages: [
          system,
          { role: 'user', content: `${args.prompt}\n\n${jsonInstruction(args.schema)}` },
        ],
        maxTokens: args.maxTokens,
        call,
      })
      const usage = addUsage(billed, retry.usage)
      billed = usage
      assertComplete(retry.doneReason, usage)
      const retried = safeParseAnswer(args.schema, stripThink(retry.content))
      if (!retried.success) throw aiErrorWithUsage(FORMAT_MESSAGE, usage)
      return { object: retried.data, usage, model: retry.model }
    } catch (error) {
      if (error instanceof OllamaHttpError) throw error
      throw toAiError(error, billed, call)
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

  private async collectStream(
    args: StreamTextArgs,
    model: string,
    channel: TextChannel,
  ): Promise<{ text: string; usage: AiUsage; model: string }> {
    const call: CallLimits = { signal: args.signal, timeoutMs: args.timeoutMs }
    try {
      const response = await this.post(
        this.chatBody({
          model,
          messages: [
            { role: 'system', content: args.system },
            { role: 'user', content: args.prompt },
          ],
          stream: true,
          maxTokens: args.maxTokens,
        }),
        call,
      )
      if (!response.body) throw new Error('Ollama stream had no body')

      let raw = ''
      let emitted = ''
      let usage = NO_USAGE
      let doneReason: string | undefined
      let resultModel = model
      // Pushes the part of the visible text that has not been sent yet.
      const pushVisible = (visible: string | undefined) => {
        if (visible === undefined || visible.length <= emitted.length) return
        channel.push(visible.slice(emitted.length))
        emitted = visible
      }
      const handleLine = (line: string) => {
        if (!line.trim()) return
        const chunk = JSON.parse(line) as ChatResponse
        if (chunk.model) resultModel = chunk.model
        raw += chunk.message?.content ?? ''
        if (chunk.done) {
          usage = usageOf(chunk)
          doneReason = chunk.done_reason
        }
        pushVisible(visibleText(raw))
      }

      const decoder = new TextDecoder()
      const reader = response.body.getReader()
      let buffered = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffered += decoder.decode(value, { stream: true })
        let newline = buffered.indexOf('\n')
        while (newline !== -1) {
          handleLine(buffered.slice(0, newline))
          buffered = buffered.slice(newline + 1)
          newline = buffered.indexOf('\n')
        }
      }
      buffered += decoder.decode()
      handleLine(buffered)

      assertComplete(doneReason, usage)
      const text = stripThink(raw)
      pushVisible(text)
      channel.close()
      return { text, usage, model: resultModel }
    } catch (error) {
      if (error instanceof OllamaHttpError) {
        channel.fail(error)
        throw error
      }
      const aiError = toAiError(error, NO_USAGE, call)
      channel.fail(aiError)
      throw aiError
    }
  }

  /** One non-streaming /api/chat call. The answer text is returned as-is, think block included. */
  private async chat(args: {
    model: string
    messages: ChatMessage[]
    format?: unknown
    maxTokens: number
    call: CallLimits
  }): Promise<ChatResult> {
    const response = await this.post(
      this.chatBody({
        model: args.model,
        messages: args.messages,
        stream: false,
        format: args.format,
        maxTokens: args.maxTokens,
      }),
      args.call,
    )
    const data = (await response.json()) as ChatResponse
    return {
      content: data.message?.content ?? '',
      usage: usageOf(data),
      model: data.model ?? args.model,
      doneReason: data.done_reason,
    }
  }

  private chatBody(args: {
    model: string
    messages: ChatMessage[]
    stream: boolean
    format?: unknown
    maxTokens: number
  }) {
    const o = this.settings
    return {
      model: args.model,
      messages: args.messages,
      stream: args.stream,
      ...(args.format !== undefined ? { format: args.format } : {}),
      ...(o.think !== undefined ? { think: o.think } : {}),
      keep_alive: o.keepAlive ?? '30m',
      options: definedOnly({
        num_ctx: o.numCtx,
        temperature: o.temperature,
        top_p: o.topP,
        top_k: o.topK,
        min_p: o.minP,
        num_predict: args.maxTokens,
      }),
    }
  }

  private async post(body: object, call: CallLimits): Promise<Response> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: requestSignal(call),
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new OllamaHttpError(response.status)
    }
    return response
  }
}

/**
 * Visible part of a streamed answer so far, or undefined while it is still unclear whether a
 * think block starts the answer. Think text is never returned.
 */
function visibleText(raw: string): string | undefined {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith(THINK_OPEN)) {
    return trimmed.includes('</think>') ? stripThink(raw) : undefined
  }
  if (THINK_OPEN.startsWith(trimmed)) return undefined
  return raw
}

/** Signal for one request: the caller's cancel, joined with the time limit when there is one. */
function requestSignal(call: CallLimits): AbortSignal | undefined {
  const timeoutSignal =
    call.timeoutMs !== undefined ? AbortSignal.timeout(call.timeoutMs) : undefined
  if (call.signal && timeoutSignal) return AbortSignal.any([call.signal, timeoutSignal])
  return call.signal ?? timeoutSignal
}

/** Output stopped at the token limit: the answer is cut off and cannot be used. */
function assertComplete(doneReason: string | undefined, usage: AiUsage): void {
  if (doneReason === 'length') throw aiErrorWithUsage(MAX_TOKENS_MESSAGE, usage)
}

/** AI_ERROR for a call the server already answered. `details.usage` lets run.ts count those tokens. */
function aiErrorWithUsage(message: string, usage: AiUsage): AppError {
  return new AppError('AI_ERROR', message, { usage })
}

function usageOf(data: ChatResponse): AiUsage {
  return { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 }
}

function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
}

function definedOnly(values: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, number] => entry[1] !== undefined),
  )
}

/** Maps any other failure to the Korean AI_ERROR or CANCELLED error the app shows. */
function toAiError(error: unknown, billed: AiUsage, call: CallLimits): AppError {
  if (error instanceof AppError) return error
  const billedAny = billed.inputTokens > 0 || billed.outputTokens > 0
  const details = billedAny ? { usage: billed } : undefined
  if (isAbortError(error)) {
    // An abort the caller did not send, on a call with a time limit, came from that limit.
    const timedOut = call.timeoutMs !== undefined && !call.signal?.aborted
    return timedOut
      ? new AppError('AI_ERROR', AI_TIMEOUT_MESSAGE, details)
      : new AppError('CANCELLED', AI_CANCELLED_MESSAGE, details)
  }
  const reason = error instanceof Error ? error.message : String(error)
  return new AppError('AI_ERROR', `AI 호출에 실패했습니다: ${reason.slice(0, 120)}`, details)
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError'
}
