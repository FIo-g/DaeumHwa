import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
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
import type { AiTaskName } from '@/db/types'
import { AppError } from '@/lib/errors'

export type OllamaThink = boolean | 'low' | 'medium' | 'high'

/** Failure tag on the AppError of a mid-stream server failure (runner crash, dropped connection). */
export const OLLAMA_STREAM_FAILURE = 'OLLAMA_STREAM'

/** Ollama's own timings for one successful HTTP attempt. Durations are already converted to ms. */
export type OllamaCallStats = {
  task: AiTaskName
  model: string
  promptTokens: number
  promptMs: number
  outputTokens: number
  evalMs: number
  totalMs: number
}

/**
 * Ollama's record of one HTTP attempt that got a response stream, with the thinking length.
 * Attempts that failed before a response (connect error, HTTP error) are not reported, so the
 * attempt count of a call is the number of reported attempts. Times are ms; null when there is no
 * done chunk or the server left the field out. Only lengths of thinking are kept, never the text.
 */
export type OllamaAttempt = {
  task: AiTaskName
  model: string
  /** 1 = first request of a call, 2 = the plain JSON retry. A stream is always 1. */
  attempt: number
  /** True when a done chunk arrived. */
  done: boolean
  doneReason: string | null
  loadMs: number | null
  promptEvalMs: number | null
  evalMs: number | null
  totalMs: number | null
  /** totalMs minus load, prompt eval and eval. Not clamped, so a negative value is kept. */
  otherMs: number | null
  promptEvalCount: number | null
  evalCount: number | null
  thinkingChunks: number
  thinkingChars: number
}

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
  /** Per-task override of `think`. A task not listed uses `think`. */
  thinkByTask?: Partial<Record<AiTaskName, OllamaThink>>
  /** How long Ollama keeps the model loaded after a call. Defaults to '30m'. */
  keepAlive?: string
  /** Injected in tests; defaults to ollamaTransport. */
  fetch?: typeof fetch
  /** Called once per successful HTTP attempt with Ollama's timings. The app does not set it. */
  onStats?: (s: OllamaCallStats) => void
  /**
   * Called once per HTTP attempt that got a response stream, also when the stream failed or was
   * cut. The app does not set it.
   */
  onAttempt?: (a: OllamaAttempt) => void
}

/** Non-2xx answer from the Ollama server. Passed through unchanged, not wrapped as AppError. */
export class OllamaHttpError extends Error {
  readonly status: number
  /** The start of the response body, which Ollama uses for reasons such as a missing model. */
  readonly detail: string

  constructor(status: number, body = '') {
    const detail = body.trim().slice(0, 300)
    super(`Ollama request failed with HTTP ${status}${detail ? `: ${detail}` : ''}`)
    this.name = 'OllamaHttpError'
    this.status = status
    this.detail = detail
  }
}

type ChatMessage = { role: 'system' | 'user'; content: string }

/** The fields of an /api/chat answer (one object, or one NDJSON line when streaming). */
type ChatResponse = {
  model?: string
  message?: { content?: string; thinking?: string }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  /** Nanoseconds. */
  load_duration?: number
  /** Nanoseconds. */
  prompt_eval_duration?: number
  eval_count?: number
  /** Nanoseconds. */
  eval_duration?: number
  /** Nanoseconds. */
  total_duration?: number
  /** Set on an NDJSON line when the server failed mid-stream. */
  error?: string
}

type ObjectResult<T> = { object: T; usage: AiUsage; model: string }

/** Caller's cancel signal and time limit, shared by every request of one call. */
type CallLimits = { signal?: AbortSignal; timeoutMs?: number }

type ChatResult = { content: string; usage: AiUsage; model: string; doneReason?: string }

const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0 }
const THINK_OPEN = '<think>'
const STREAM_INCOMPLETE_MESSAGE = 'AI 응답이 중간에 끊겼습니다. 다시 시도해 주세요.'
const LEADING_THINK = /^\s*<think>[\s\S]*?<\/think>\s*/

/** Removes a think block at the start of a model answer. Text without one is returned unchanged. */
export function stripThink(text: string): string {
  return text.replace(LEADING_THINK, '')
}

const NO_BODY_STATUSES = new Set([101, 103, 204, 205, 304])

/**
 * Default transport for Ollama calls, built on node:http / node:https with no timeouts. Global fetch
 * (undici) rejects when headers take longer than 300 s, and Ollama sends headers only after the
 * prompt is evaluated, so a long prompt on a local model would fail. Honours the abort signal and
 * rejects with its reason; socket errors become `TypeError('fetch failed')` with the socket error
 * as cause, like fetch. Request bodies must be strings (what Ollama calls send).
 */
export const ollamaTransport: typeof fetch = (input, init) =>
  new Promise<Response>((resolve, reject) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const signal = init?.signal ?? undefined
    const abortReason = () =>
      signal?.reason ?? new DOMException('This operation was aborted', 'AbortError')
    if (signal?.aborted) {
      reject(abortReason())
      return
    }

    const body = init?.body === undefined || init.body === null ? undefined : String(init.body)
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value
    })
    if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body))

    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    // agent: false opens a fresh socket per call, so no idle socket is reused after a long wait.
    const req = send(url, { method: init?.method ?? 'GET', headers, agent: false })
    let incoming: IncomingMessage | undefined

    const onAbort = () => {
      const reason = abortReason()
      reject(reason)
      req.destroy()
      incoming?.destroy(reason as Error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    req.once('close', () => signal?.removeEventListener('abort', onAbort))
    // Errors before the response reach the caller as fetch's error; later ones surface on the body.
    req.on('error', (error) => reject(new TypeError('fetch failed', { cause: error })))
    req.on('response', (res) => {
      incoming = res
      const responseHeaders = new Headers()
      for (const [key, value] of Object.entries(res.headers)) {
        if (value === undefined) continue
        for (const item of Array.isArray(value) ? value : [value]) {
          responseHeaders.append(key, item)
        }
      }
      const status = res.statusCode ?? 500
      if (NO_BODY_STATUSES.has(status)) {
        res.resume()
      }
      resolve(
        new Response(
          NO_BODY_STATUSES.has(status) ? null : (Readable.toWeb(res) as ReadableStream),
          { status, statusText: res.statusMessage ?? '', headers: responseHeaders },
        ),
      )
    })
    req.end(body)
  })

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
    this.fetchImpl = options.fetch ?? ollamaTransport
  }

  async generateObject<T>(args: GenerateObjectArgs<T>): Promise<ObjectResult<T>> {
    const model = args.model ?? this.defaultModel
    const call: CallLimits = { signal: args.signal, timeoutMs: args.timeoutMs }
    const system: ChatMessage = { role: 'system', content: args.system }
    let billed = NO_USAGE
    try {
      const first = await this.chat({
        task: args.task.name,
        model,
        messages: [system, { role: 'user', content: ollamaUserText(args) }],
        format: z.toJSONSchema(args.schema),
        maxTokens: args.maxTokens,
        call,
        billed,
        attempt: 1,
      })
      billed = first.usage
      assertComplete(first.doneReason, billed)
      const checked = safeParseAnswer(args.schema, stripThink(first.content))
      if (checked.success) return { object: checked.data, usage: billed, model: first.model }

      const retry = await this.chat({
        task: args.task.name,
        model,
        messages: [
          system,
          { role: 'user', content: ollamaUserText(args, `\n\n${jsonInstruction(args.schema)}`) },
        ],
        maxTokens: args.maxTokens,
        call,
        billed,
        attempt: 2,
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
          task: args.task.name,
          model,
          messages: [
            { role: 'system', content: args.system },
            { role: 'user', content: ollamaUserText(args) },
          ],
          stream: true,
          maxTokens: args.maxTokens,
        }),
        call,
      )
      let emitted = ''
      // Pushes the part of the visible text that has not been sent yet.
      const pushVisible = (visible: string | undefined) => {
        if (visible === undefined || visible.length <= emitted.length) return
        channel.push(visible.slice(emitted.length))
        emitted = visible
      }
      const answer = await this.readStream({
        task: args.task.name,
        model,
        response,
        billed: NO_USAGE,
        attempt: 1,
        onContent: (raw) => pushVisible(visibleText(raw)),
      })
      assertComplete(answer.doneReason, answer.usage)
      const text = stripThink(answer.content)
      pushVisible(text)
      channel.close()
      return { text, usage: answer.usage, model: answer.model }
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

  /**
   * Reads one streamed /api/chat answer (NDJSON). onContent gets the raw content text so far;
   * thinking chunks are skipped. Stats are reported once, from the done chunk.
   */
  private async readStream(args: {
    task: AiTaskName
    model: string
    response: Response
    billed: AiUsage
    /** 1 for the first request of a call, 2 for the JSON retry. */
    attempt: number
    onContent?: (raw: string) => void
  }): Promise<ChatResult> {
    if (!args.response.body) throw new Error('Ollama stream had no body')
    let raw = ''
    let usage = NO_USAGE
    let doneReason: string | undefined
    let sawDone = false
    let resultModel = args.model
    let doneChunk: ChatResponse | undefined
    let thinkingChunks = 0
    let thinkingChars = 0
    let reported = false
    // Reports this attempt once, whether it finished, failed or was cut.
    const report = () => {
      if (reported) return
      reported = true
      this.settings.onAttempt?.(
        attemptOf({
          task: args.task,
          model: args.model,
          attempt: args.attempt,
          done: doneChunk,
          thinkingChunks,
          thinkingChars,
        }),
      )
    }
    const handleLine = (line: string) => {
      if (!line.trim()) return
      const chunk = JSON.parse(line) as ChatResponse
      if (chunk.error !== undefined) {
        throw streamFailure(`AI 호출에 실패했습니다: ${chunk.error.slice(0, 120)}`, args.billed)
      }
      if (chunk.model) resultModel = chunk.model
      raw += chunk.message?.content ?? ''
      const thinking = chunk.message?.thinking
      if (typeof thinking === 'string' && thinking.length > 0) {
        thinkingChunks += 1
        thinkingChars += thinking.length
      }
      if (chunk.done) {
        sawDone = true
        doneChunk = chunk
        usage = usageOf(chunk)
        doneReason = chunk.done_reason
        this.settings.onStats?.(statsOf(args.task, args.model, chunk))
      }
      args.onContent?.(raw)
    }

    const decoder = new TextDecoder()
    const reader = args.response.body.getReader()
    let buffered = ''
    try {
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
    } catch (error) {
      // Report before cancelling, so the record exists even if the cancel is slow.
      report()
      // Stop the body so Ollama does not keep generating into a reader nobody reads.
      await reader.cancel().catch(() => undefined)
      throw withCauseCode(error)
    }

    report()
    // Without a done chunk the answer was cut short; it must not be scored as complete.
    if (!sawDone) throw streamFailure(STREAM_INCOMPLETE_MESSAGE, args.billed)
    return { content: raw, usage, model: resultModel, doneReason }
  }

  /** One streamed /api/chat call. The answer text is returned as-is, think block included. */
  private async chat(args: {
    task: AiTaskName
    model: string
    messages: ChatMessage[]
    format?: unknown
    maxTokens: number
    call: CallLimits
    billed: AiUsage
    attempt: number
  }): Promise<ChatResult> {
    const response = await this.post(
      this.chatBody({
        task: args.task,
        model: args.model,
        messages: args.messages,
        stream: true,
        format: args.format,
        maxTokens: args.maxTokens,
      }),
      args.call,
    )
    return this.readStream({
      task: args.task,
      model: args.model,
      response,
      billed: args.billed,
      attempt: args.attempt,
    })
  }

  private chatBody(args: {
    task: AiTaskName
    model: string
    messages: ChatMessage[]
    stream: boolean
    format?: unknown
    maxTokens: number
  }) {
    const o = this.settings
    // `??` on the lookup only: a `false` override must win over a `true` default.
    const think = o.thinkByTask?.[args.task] ?? o.think
    return {
      model: args.model,
      messages: args.messages,
      stream: args.stream,
      ...(args.format !== undefined ? { format: args.format } : {}),
      ...(think !== undefined ? { think } : {}),
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
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: requestSignal(call),
      })
    } catch (error) {
      throw withCauseCode(error)
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new OllamaHttpError(response.status, body)
    }
    return response
  }
}

/**
 * Visible part of a streamed answer so far, or undefined while it is still unclear whether a
 * think block starts the answer. Think text is never returned.
 */
/**
 * User text for Ollama: the prefix blocks, then the prompt (with `tail`, e.g. the JSON instruction),
 * joined by blank lines. Without a prefix it is the prompt alone, as before.
 */
function ollamaUserText(args: { prompt: string; promptPrefix?: string[] }, tail = ''): string {
  return [...(args.promptPrefix ?? []), `${args.prompt}${tail}`].join('\n\n')
}

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

/**
 * fetch rejects with a bare "fetch failed" TypeError; the real reason (e.g. UND_ERR_HEADERS_TIMEOUT)
 * is on its cause. Body reads can fail with a socket error that carries the code on itself. Put the
 * code in the message so logs and classifyError can see it. Abort errors and app errors are returned
 * unchanged, since their name or code decides the outcome.
 */
function withCauseCode(error: unknown): unknown {
  if (isAbortError(error) || !(error instanceof Error) || error instanceof AppError) return error
  const code =
    (error.cause as { code?: unknown } | undefined)?.code ?? (error as { code?: unknown }).code
  if (typeof code !== 'string') return error
  return new Error(`${error.message} (${code})`, { cause: error })
}

/** Output stopped at the token limit: the answer is cut off and cannot be used. */
function assertComplete(doneReason: string | undefined, usage: AiUsage): void {
  if (doneReason === 'length') throw aiErrorWithUsage(MAX_TOKENS_MESSAGE, usage)
}

/** AI_ERROR for a call the server already answered. `details.usage` lets run.ts count those tokens. */
function aiErrorWithUsage(message: string, usage: AiUsage): AppError {
  return new AppError('AI_ERROR', message, { usage })
}

/** AI_ERROR for a server failure mid-answer. The failure tag lets classifyError treat it as external. */
function streamFailure(message: string, usage: AiUsage): AppError {
  return new AppError('AI_ERROR', message, { usage, failure: OLLAMA_STREAM_FAILURE })
}

function usageOf(data: ChatResponse): AiUsage {
  return { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 }
}

const NS_PER_MS = 1_000_000

/** Ollama's timings from one answer. Missing fields count as zero. */
function statsOf(task: AiTaskName, model: string, data: ChatResponse): OllamaCallStats {
  return {
    task,
    model: data.model ?? model,
    promptTokens: data.prompt_eval_count ?? 0,
    promptMs: (data.prompt_eval_duration ?? 0) / NS_PER_MS,
    outputTokens: data.eval_count ?? 0,
    evalMs: (data.eval_duration ?? 0) / NS_PER_MS,
    totalMs: (data.total_duration ?? 0) / NS_PER_MS,
  }
}

/** One attempt's record. Without a done chunk every Ollama field is null. */
function attemptOf(args: {
  task: AiTaskName
  model: string
  attempt: number
  done: ChatResponse | undefined
  thinkingChunks: number
  thinkingChars: number
}): OllamaAttempt {
  const data = args.done
  const ms = (ns: number | undefined): number | null => (ns === undefined ? null : ns / NS_PER_MS)
  const loadMs = ms(data?.load_duration)
  const promptEvalMs = ms(data?.prompt_eval_duration)
  const evalMs = ms(data?.eval_duration)
  const totalMs = ms(data?.total_duration)
  return {
    task: args.task,
    model: data?.model ?? args.model,
    attempt: args.attempt,
    done: data !== undefined,
    doneReason: data?.done_reason ?? null,
    loadMs,
    promptEvalMs,
    evalMs,
    totalMs,
    otherMs:
      totalMs === null ? null : totalMs - (loadMs ?? 0) - (promptEvalMs ?? 0) - (evalMs ?? 0),
    promptEvalCount: data?.prompt_eval_count ?? null,
    evalCount: data?.eval_count ?? null,
    thinkingChunks: args.thinkingChunks,
    thinkingChars: args.thinkingChars,
  }
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
    // fetch rejects with TimeoutError when AbortSignal.timeout fires. An abort the caller did not
    // send, on a call with a time limit, also came from that limit.
    const timedOut =
      isTimeoutError(error) || (call.timeoutMs !== undefined && !call.signal?.aborted)
    return timedOut
      ? new AppError('AI_ERROR', AI_TIMEOUT_MESSAGE, details)
      : new AppError('CANCELLED', AI_CANCELLED_MESSAGE, details)
  }
  const reason = error instanceof Error ? error.message : String(error)
  return new AppError('AI_ERROR', `AI 호출에 실패했습니다: ${reason.slice(0, 120)}`, details)
}

function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

function isTimeoutError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'TimeoutError'
}
