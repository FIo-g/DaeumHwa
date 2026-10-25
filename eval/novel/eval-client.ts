import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chapterExtractTask } from '@/ai/tasks/chapter-extract'
import { continuityCheckTask } from '@/ai/tasks/continuity-check'
import { directionAdviceTask } from '@/ai/tasks/direction-advice'
import { draftRepairTask } from '@/ai/tasks/draft-repair'
import { interviewExtractTask } from '@/ai/tasks/interview-extract'
import { interviewQuestionTask } from '@/ai/tasks/interview-question'
import { proofreadTask } from '@/ai/tasks/proofread'
import { READER_SIM_CLOUD_TIMEOUT_MS, readerSimTask } from '@/ai/tasks/reader-sim'
import { styleSuggestTask } from '@/ai/tasks/style-suggest'
import { DEFAULT_AI_TIMEOUT_MS, isLocalProvider, STREAM_AI_TIMEOUT_MS } from '@/ai/run'
import type { AiClient, AiEffort, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import {
  OLLAMA_STREAM_FAILURE,
  type OllamaAttempt,
  type OllamaCallStats,
  type OllamaThink,
} from '@/ai/ollama'
import type { AiTaskName } from '@/db/types'
import { AppError } from '@/lib/errors'
import { type HelperThink, type ModelProfile, thinkFor } from './models'
import { billedUsageOf } from '../billed-usage'
import { planRetry, type RetryBudget, type RetryHint, retryReasonOf } from './retry-budget'
import { type PowerInfo, type PowerReader, UNKNOWN_POWER } from './power'
import { EN_SYSTEMS } from './localize/en-systems'
import { countHangul, translateScaffold } from './localize/scaffold'
import { type CallOllama, callOllama, promptRateSuspect } from './ollama-detail'

// Eval client: wraps the real AI client for one model profile. It forces the eval settings (the
// profile's effort, model and output floor), optionally swaps prompts to English, and writes one
// JSON record per call. Product code never uses it.

export type FailureKind = 'external-limit' | 'external-network' | 'model'

/**
 * Generation and prompt speed of one call. Ollama calls use Ollama's own timings (`ollama`). Other
 * providers use wall-clock time, which includes network and any thinking (`wall`).
 */
export type CallSpeed = {
  outputTokensPerSec: number | null
  promptTokensPerSec: number | null
  source: 'ollama' | 'wall'
}

export type CallRecord = {
  seq: number
  task: AiTaskName
  /** Step key the runner was on, e.g. 'ch2:draft'; null outside the step machine. */
  step: string | null
  kind: 'object' | 'stream'
  startedAt: string
  durationMs: number
  /** Streams: ms from the start to the first non-empty chunk. Objects: null. */
  firstTokenMs: number | null
  speed: CallSpeed
  model: string
  /** Effort the eval passed to the inner client (the profile's). A provider may ignore it; Ollama does. */
  effortRequested: AiEffort
  /** Output cap the eval passed to the inner client: the larger of the task's value and the profile floor, or the task's value with `--product-limits`. */
  maxTokens: number
  /** The task's own effort, as the product sends it. */
  taskEffort?: AiEffort
  /** The task's own maxTokens, as the product sends it. */
  taskMaxTokens?: number
  /** How `maxTokens` was chosen. */
  maxTokensRule?: 'floor' | 'product'
  /** How `effortRequested` was chosen: the profile's effort, or the task's own with `--deploy-settings`. */
  effortRule?: 'profile' | 'task'
  productTimeoutMs: number
  wouldTimeOut: boolean
  system: string
  prompt: string
  /** The prefix blocks as sent (translated on English runs). Present only on calls that had a prefix. */
  promptPrefix?: string[]
  output: unknown | null
  usage: AiUsage | null
  /** Hangul left in an English run's system, prefix and prompt; null for Korean runs, where it is the whole prompt. */
  hangulLeft: number | null
  contextOverflow: boolean
  error: { kind: FailureKind; message: string; status?: number } | null
  /** ms the call waited for the local lane; 0 when it did not wait or the profile is not local. */
  queueMs?: number
  /** queueMs + durationMs: the wait-inclusive time that durationMs used to hold. */
  waitInclusiveMs?: number
  /** The Ollama `think` value the call asked for; null when the profile has no Ollama settings. */
  thinkRequested?: OllamaThink | null
  /** Machine power state when the call started. Local profiles only; absent on cloud runs and on records written before M1. */
  power?: PowerInfo
  /** Ollama's record of the call: its attempts and time outside Ollama's timer. Present on Ollama calls that reported at least one attempt; absent on cloud calls and on records written before M2. */
  ollama?: CallOllama
  /** Present on a call that was the retry of a failed call and ran with a changed budget. `maxTokens` is the widened cap or null, `think` is the lowered think or null; `maxTokens` and `thinkRequested` of the record hold what was really sent. */
  retryBudget?: RetryBudget
  /** True on a cloud call the stall guard cut. Absent otherwise and on records written before stage 3. */
  stalled?: boolean
}

/** Grace after the product timeout before a cloud call is cut as stalled. */
export const STALL_GRACE_MS = 60_000
/** Message of the model error thrown after two stalls. */
export const STALLED_MESSAGE = 'AI 호출이 멈춰 두 번 끊었습니다.'
/** Message of the model error thrown when a stream stalls after sending text. */
export const STALLED_PARTIAL_MESSAGE = 'AI 호출이 글을 보내다 멈춰 끊었습니다.'

export interface EvalClientOptions {
  inner: AiClient
  profile: ModelProfile
  lang: 'ko' | 'en'
  callsDir: string
  startSeq?: number
  now?: () => number
  /** Think level for helper tasks in a compare run. See `thinkFor` in ./models. */
  helperThink?: HelperThink
  /** Send the task's own maxTokens, without the profile floor (`--product-limits`). Effort is not affected. */
  productLimits?: boolean
  /** Send the task's own effort and maxTokens, as the product does (`--deploy-settings`). Implies productLimits. */
  deploySettings?: boolean
  /** Reads the machine power state. Used for local profiles only; see the constructor. */
  readPower?: PowerReader
  /** Client used for a retry whose think is lowered; built by `createRetryClient`. Without it only the output cap can change. */
  retryInner?: AiClient
}

type CallError = NonNullable<CallRecord['error']>

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

/**
 * Message wording of the real clients. Anthropic and Responses errors reach here as AppError
 * messages (`AI 호출에 실패했습니다: <reason>`, see src/ai/anthropic.ts and src/ai/responses.ts), so
 * the reason text is the only signal for them.
 */
const LIMIT_PATTERN = /usage limit|rate limit|quota|too many requests|요청이 너무 많습니다/i
const NETWORK_PATTERN =
  /fetch failed|connection error|socket hang up|\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR_[A-Z_]+)\b/i

/**
 * Statuses and wording that mean the harness is misconfigured (bad or missing key, no payment
 * plan, model not installed or not in the plan), not that the model answered badly. They pause
 * the run like a network failure, so a misconfigured run never completes as "model failures".
 */
const CONFIG_STATUSES = new Set([401, 402, 403, 404])
const CONFIG_PATTERN =
  /API 키가 올바르지 않습니다|invalid api key|authentication|unauthori[sz]ed|forbidden|model .*not found|not found, try pulling/i

/** Higher wins when several failures are recorded before one is taken. */
const SEVERITY: Record<FailureKind, number> = {
  model: 0,
  'external-network': 1,
  'external-limit': 2,
}

/**
 * The time limit the product applies to a task on this provider. Mirrors `runReaderSimulation`: a
 * cloud reader-sim call is one call with the longer limit; local per-persona calls keep the default.
 */
function productTaskTimeout(task: AiTaskName, provider: string): number | undefined {
  if (task === 'reader-sim' && !isLocalProvider(provider)) return READER_SIM_CLOUD_TIMEOUT_MS
  return TASK_DEFS.find((def) => def.name === task)?.timeoutMs
}

/** Task defs that set their own time limit. Tasks without one use the product default. */
const TASK_DEFS: readonly { name: AiTaskName; timeoutMs?: number }[] = [
  chapterExtractTask,
  continuityCheckTask,
  directionAdviceTask,
  draftRepairTask,
  interviewExtractTask,
  interviewQuestionTask,
  proofreadTask,
  readerSimTask,
  styleSuggestTask,
]

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message)
  }
  return String(error)
}

function errorField(error: unknown, key: 'status' | 'code' | 'cause'): unknown {
  if (typeof error === 'object' && error !== null && key in error) {
    return (error as Record<typeof key, unknown>)[key]
  }
  return undefined
}

/** HTTP status from a structured field (SDK errors, OllamaHttpError), else from an `HTTP <n>` phrase. */
function statusOf(error: unknown): number | undefined {
  const status = errorField(error, 'status')
  if (typeof status === 'number') return status
  const match = /HTTP (\d{3})\b/.exec(errorMessage(error))
  return match ? Number(match[1]) : undefined
}

/** The failure tag an inner client put on its AppError details, if any. */
function failureTag(error: unknown): unknown {
  if (!(error instanceof AppError)) return undefined
  return (error.details as { failure?: unknown } | undefined)?.failure
}

/** A network error code on the error or on its cause chain (checked a few levels deep). */
function hasNetworkCode(error: unknown, depth = 0): boolean {
  if (depth > 3) return false
  const code = errorField(error, 'code')
  if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true
  const cause = errorField(error, 'cause')
  return cause !== undefined && cause !== error && hasNetworkCode(cause, depth + 1)
}

/**
 * Sorts a failed call into external limit, external network, or the model's own failure. Format,
 * refusal, max-tokens and timeout failures are the model's own and stay `model`. Configuration
 * failures (see CONFIG_STATUSES) are external network failures, so the run pauses.
 */
export function classifyError(error: unknown): FailureKind {
  const message = errorMessage(error)
  const status = statusOf(error)
  if (error instanceof AppError && error.code === 'AI_LIMIT') return 'external-limit'
  // A server failure mid-answer (runner crash, dropped connection) is not the model's output.
  if (failureTag(error) === OLLAMA_STREAM_FAILURE) return 'external-network'
  if (status === 429 || LIMIT_PATTERN.test(message)) return 'external-limit'
  if ((status !== undefined && CONFIG_STATUSES.has(status)) || CONFIG_PATTERN.test(message)) {
    return 'external-network'
  }
  if (status !== undefined && status >= 500) return 'external-network'
  if (hasNetworkCode(error) || NETWORK_PATTERN.test(message)) return 'external-network'
  return 'model'
}

/**
 * Holds the chunks a pump reads until the caller iterates. The caller gets every chunk once, in
 * order, and a failure surfaces after the chunks that came before it.
 */
class ChunkRelay {
  private readonly queue: string[] = []
  private ended = false
  private failure: { error: unknown } | null = null
  private wake: (() => void) | null = null

  push(piece: string): void {
    this.queue.push(piece)
    this.notify()
  }

  end(): void {
    this.ended = true
    this.notify()
  }

  fail(error: unknown): void {
    this.failure = { error }
    this.notify()
  }

  async *iterate(): AsyncGenerator<string> {
    for (;;) {
      const next = this.queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (this.failure) throw this.failure.error
      if (this.ended) return
      // No await between the checks above and this registration, so no wake-up is lost.
      await new Promise<void>((resolve) => {
        this.wake = resolve
      })
    }
  }

  private notify(): void {
    const wake = this.wake
    this.wake = null
    wake?.()
  }
}

/** Speed of one call from its Ollama timings, or from wall-clock time when there are none. */
function speedOf(args: {
  ok: boolean
  kind: 'object' | 'stream'
  durationMs: number
  firstTokenMs: number | null
  usage: AiUsage | null
  ollama: OllamaCallStats[]
  /** True when the prompt rate cannot be trusted (see ollama-detail); the prompt speed is then left out. */
  promptCacheSuspected: boolean
}): CallSpeed {
  if (args.ollama.length > 0) {
    if (!args.ok) return { outputTokensPerSec: null, promptTokensPerSec: null, source: 'ollama' }
    const sum = (pick: (s: OllamaCallStats) => number) =>
      args.ollama.reduce((total, s) => total + pick(s), 0)
    return {
      outputTokensPerSec: ratePerSec(
        sum((s) => s.outputTokens),
        sum((s) => s.evalMs),
      ),
      promptTokensPerSec: args.promptCacheSuspected
        ? null
        : ratePerSec(
            sum((s) => s.promptTokens),
            sum((s) => s.promptMs),
          ),
      source: 'ollama',
    }
  }
  const none: CallSpeed = { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' }
  if (!args.ok || args.usage === null) return none
  // A stream's generation window starts at its first token; without one there is no window.
  const windowMs =
    args.kind === 'stream'
      ? args.firstTokenMs === null
        ? null
        : args.durationMs - args.firstTokenMs
      : args.durationMs
  if (windowMs === null) return none
  return { ...none, outputTokensPerSec: ratePerSec(args.usage.outputTokens, windowMs) }
}

/** Tokens per second from a token count and a duration in ms; null when the duration is zero. */
function ratePerSec(tokens: number, ms: number): number | null {
  return ms > 0 ? tokens / (ms / 1000) : null
}

type Prepared = {
  seq: number
  task: AiTaskName
  step: string | null
  kind: 'object' | 'stream'
  startedMs: number
  startedAt: string
  system: string
  prompt: string
  promptPrefix?: string[]
  maxTokens: number
  /** The budget change of a repeat of a failed call, or null. */
  retry: RetryBudget | null
  taskEffort: AiEffort
  taskMaxTokens: number
  maxTokensRule: 'floor' | 'product'
  /** The effort the inner client receives. */
  effort: AiEffort
  effortRule: 'profile' | 'task'
  productTimeoutMs: number
  power?: PowerInfo
  /** Local calls only: a hash of task, system and prompt. Null on other providers. */
  promptKey: string | null
  /** True when an identical prompt was already sent to Ollama in this process. */
  promptRepeated: boolean
}

type Outcome = { ok: true; output: unknown; usage: AiUsage } | { ok: false; error: unknown }

/** The error a waiter gets when its signal aborts, as ollamaTransport makes it. */
function abortErrorOf(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('This operation was aborted', 'AbortError')
}

/**
 * Resolves when `prev` resolves, or rejects as soon as `signal` aborts. The listener is removed
 * once `prev` resolves, so a finished wait leaves nothing on the signal.
 */
function waitTurn(prev: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return prev
  if (signal.aborted) return Promise.reject(abortErrorOf(signal))
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortErrorOf(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    prev.then(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    })
  })
}

export class EvalClient implements AiClient {
  readonly provider: string
  readonly defaultModel: string
  /** Records of this process only. */
  readonly records: CallRecord[] = []
  private seq: number
  /** Most severe failure recorded since the last take. */
  private pendingFailure: CallError | null = null
  /** Retry hint of the failure held in pendingFailure (local profiles only). */
  private pendingRetry: RetryHint | null = null
  /** The hint of the failure the last takeLastFailure() returned. */
  private takenRetry: RetryHint | null = null
  /** The failed call to change the budget of while a retry attempt runs. */
  private retrying: RetryHint | null = null
  /** Ollama timings reported by the inner client, waiting for their call to settle. */
  private readonly ollamaStats = new Map<AiTaskName, OllamaCallStats[]>()
  /** Ollama attempts reported by the inner client, waiting for their call to settle. */
  private readonly ollamaAttempts = new Map<AiTaskName, OllamaAttempt[]>()
  /** Prompt keys already sent to Ollama in this process (local profiles only). */
  private readonly sentPrompts = new Set<string>()
  private step: string | null = null
  /** Tail of the local lane: resolves when the last call that took a turn has released it. */
  private lane: Promise<void> = Promise.resolve()
  private readonly inner: AiClient
  private readonly profile: ModelProfile
  private readonly lang: 'ko' | 'en'
  private readonly callsDir: string
  private readonly now: () => number
  private readonly helperThink: HelperThink | undefined
  private readonly productLimits: boolean
  private readonly deploySettings: boolean
  /** Set only for local profiles, so cloud and fake runs never read power. */
  private readonly readPower: PowerReader | undefined
  private readonly retryInner: AiClient | undefined

  constructor(o: EvalClientOptions) {
    this.inner = o.inner
    this.retryInner = o.retryInner
    this.profile = o.profile
    this.lang = o.lang
    this.callsDir = o.callsDir
    this.now = o.now ?? Date.now
    this.seq = o.startSeq ?? 1
    this.provider = `eval:${o.inner.provider}`
    this.defaultModel = o.profile.model
    this.helperThink = o.helperThink
    this.deploySettings = o.deploySettings === true
    this.productLimits = o.productLimits === true || this.deploySettings
    this.readPower = o.profile.queue === 'local' ? o.readPower : undefined
  }

  get nextSeq(): number {
    return this.seq
  }

  /** Step key recorded on the calls that follow. The step runner sets it before each step. */
  setStep(key: string | null): void {
    this.step = key
  }

  /** Receives Ollama timings from the inner client. Each call takes its own by task name. */
  onOllamaStats(stats: OllamaCallStats): void {
    const list = this.ollamaStats.get(stats.task) ?? []
    list.push(stats)
    this.ollamaStats.set(stats.task, list)
  }

  /** Receives one Ollama HTTP attempt from the inner client. Each call takes its own by task name. */
  onOllamaAttempt(attempt: OllamaAttempt): void {
    const list = this.ollamaAttempts.get(attempt.task) ?? []
    list.push(attempt)
    this.ollamaAttempts.set(attempt.task, list)
  }

  /**
   * Returns the most severe failure recorded since the previous take (external limit, then external
   * network, then model), and clears it. Ties keep the earlier failure.
   */
  takeLastFailure(): CallError | null {
    const failure = this.pendingFailure
    this.pendingFailure = null
    this.takenRetry = this.pendingRetry
    this.pendingRetry = null
    return failure
  }

  /** Called by withModelRetry right after takeLastFailure() when it repeats the step: the calls of the failed task in the repeat may change budget. */
  beginRetry(): void {
    this.retrying = this.takenRetry
    this.takenRetry = null
  }

  /** Called when the repeat is over, whatever its outcome. */
  endRetry(): void {
    this.retrying = null
  }

  async generateObject<T>(args: GenerateObjectArgs<T>) {
    const requestedMs = this.now()
    const local = this.profile.queue === 'local'
    // Takes its turn before the first await, so local calls run in the order they were made.
    let release: () => void = () => {}
    try {
      if (local) release = await this.acquire(args.signal)
    } catch (error) {
      // Cancelled while queued: recorded as a failed call that never started, then rethrown.
      const call = this.prepare(
        args.task.name,
        'object',
        args.system,
        args.prompt,
        args.maxTokens,
        args.effort,
        args.promptPrefix,
      )
      this.settle(call, { ok: false, error }, null, call.startedMs - requestedMs)
      throw error
    }
    try {
      if (this.profile.provider === 'ollama') {
        const call = this.prepare(
          args.task.name,
          'object',
          args.system,
          args.prompt,
          args.maxTokens,
          args.effort,
          args.promptPrefix,
        )
        const queueMs = local ? call.startedMs - requestedMs : 0
        if (call.promptKey) this.sentPrompts.add(call.promptKey)
        // A synchronous throw from a non-async inner client becomes a rejection, so it is recorded too.
        const pending = (() => {
          try {
            return this.innerFor(call).generateObject<T>({
              ...args,
              system: call.system,
              prompt: call.prompt,
              promptPrefix: call.promptPrefix,
              effort: call.effort,
              maxTokens: call.maxTokens,
              model: this.profile.model,
            })
          } catch (error) {
            return Promise.reject(error)
          }
        })()
        const result = await pending.catch((error: unknown): never => {
          this.settle(call, { ok: false, error }, null, queueMs)
          throw error
        })
        this.settle(call, { ok: true, output: result.object, usage: result.usage }, null, queueMs)
        return result
      }
      return await this.generateObjectCloud<T>(args)
    } finally {
      release()
    }
  }

  /** Cloud object call with the stall guard: cut at productTimeoutMs + grace, retry once. */
  private async generateObjectCloud<T>(
    args: GenerateObjectArgs<T>,
  ): Promise<{ object: T; usage: AiUsage; model: string }> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const call = this.prepare(
        args.task.name,
        'object',
        args.system,
        args.prompt,
        args.maxTokens,
        args.effort,
        args.promptPrefix,
      )
      if (call.promptKey) this.sentPrompts.add(call.promptKey)
      const stallTimeoutMs = call.productTimeoutMs + STALL_GRACE_MS
      const stallController = new AbortController()
      const combined = args.signal
        ? AbortSignal.any([args.signal, stallController.signal])
        : stallController.signal
      const innerPromise: Promise<
        | { timeout: false; ok: true; result: { object: T; usage: AiUsage; model: string } }
        | { timeout: false; ok: false; error: unknown }
      > = (async () => {
        try {
          const result = await this.innerFor(call).generateObject<T>({
            ...args,
            system: call.system,
            prompt: call.prompt,
            promptPrefix: call.promptPrefix,
            effort: call.effort,
            maxTokens: call.maxTokens,
            model: this.profile.model,
            signal: combined,
          })
          return { timeout: false as const, ok: true as const, result }
        } catch (error) {
          return { timeout: false as const, ok: false as const, error }
        }
      })()
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true
          try {
            stallController.abort()
          } catch {
            // Aborting never fails the call; the stall below does.
          }
          resolve({ timeout: true })
        }, stallTimeoutMs)
      })
      const raced = await Promise.race([innerPromise, timeoutPromise])
      if (timer !== undefined) clearTimeout(timer)
      // Late inner settlement after a cut must not surface as unhandled.
      innerPromise.catch(() => {})
      const callerAborted = args.signal?.aborted === true
      if (raced.timeout) {
        const stallError = stallController.signal.reason ?? new Error('aborted')
        if (attempt === 1) {
          this.settle(call, { ok: false, error: stallError }, null, 0, {
            stalled: true,
            trackFailure: false,
          })
          continue
        }
        const doubleStall = new AppError('AI_ERROR', STALLED_MESSAGE)
        this.settle(call, { ok: false, error: doubleStall }, null, 0, { stalled: true })
        throw doubleStall
      }
      if (raced.ok) {
        this.settle(
          call,
          { ok: true, output: raced.result.object, usage: raced.result.usage },
          null,
          0,
        )
        return raced.result
      }
      const stalledByAbort = !callerAborted && (timedOut || stallController.signal.aborted === true)
      if (stalledByAbort) {
        if (attempt === 1) {
          this.settle(call, { ok: false, error: raced.error }, null, 0, {
            stalled: true,
            trackFailure: false,
          })
          continue
        }
        const doubleStall = new AppError('AI_ERROR', STALLED_MESSAGE)
        this.settle(call, { ok: false, error: doubleStall }, null, 0, { stalled: true })
        throw doubleStall
      }
      this.settle(call, { ok: false, error: raced.error }, null, 0)
      throw raced.error
    }
    throw new Error('unreachable')
  }

  streamText(args: StreamTextArgs) {
    if (this.profile.provider === 'ollama') {
      // Streams are not locked. The eval `draft` step awaits each stream's `done` before any other
      // AI call starts (eval/novel/steps/chapter.ts), so no helper call overlaps a stream.
      const call = this.prepare(
        args.task.name,
        'stream',
        args.system,
        args.prompt,
        args.maxTokens,
        args.effort,
        args.promptPrefix,
      )
      let inner: ReturnType<AiClient['streamText']>
      if (call.promptKey) this.sentPrompts.add(call.promptKey)
      try {
        inner = this.innerFor(call).streamText({
          ...args,
          system: call.system,
          prompt: call.prompt,
          promptPrefix: call.promptPrefix,
          effort: call.effort,
          maxTokens: call.maxTokens,
          model: this.profile.model,
        })
      } catch (error) {
        this.settle(call, { ok: false, error })
        throw error
      }
      let firstTokenMs: number | null = null
      const now = this.now
      const startedMs = call.startedMs
      const relay = new ChunkRelay()
      // Reads the inner stream from the start, whether or not the caller reads it, so the first token
      // is timed. Each chunk goes to the caller's iterable once.
      const pump = (async () => {
        try {
          for await (const piece of inner.textStream) {
            if (firstTokenMs === null && piece.length > 0) firstTokenMs = now() - startedMs
            relay.push(piece)
          }
          relay.end()
        } catch (error) {
          relay.fail(error)
        }
      })()
      // Settles after the pump has read the whole stream, so the first-token time is final.
      const final = inner.final.then(
        async (result) => {
          await pump
          this.settle(
            call,
            { ok: true, output: { text: result.text }, usage: result.usage },
            firstTokenMs,
          )
          return result
        },
        async (error: unknown) => {
          await pump
          this.settle(call, { ok: false, error }, firstTokenMs)
          throw error
        },
      )
      return { textStream: relay.iterate(), final }
    }
    return this.streamTextCloud(args)
  }

  /** Cloud stream with the stall guard: cut at productTimeoutMs + grace, retry once. */
  private streamTextCloud(args: StreamTextArgs): {
    textStream: AsyncIterable<string>
    final: Promise<{ text: string; usage: AiUsage; model: string }>
  } {
    const firstCall = this.prepare(
      args.task.name,
      'stream',
      args.system,
      args.prompt,
      args.maxTokens,
      args.effort,
      args.promptPrefix,
    )
    if (firstCall.promptKey) this.sentPrompts.add(firstCall.promptKey)
    const firstController = new AbortController()
    const firstCombined = args.signal
      ? AbortSignal.any([args.signal, firstController.signal])
      : firstController.signal
    let firstInner: ReturnType<AiClient['streamText']>
    try {
      firstInner = this.innerFor(firstCall).streamText({
        ...args,
        system: firstCall.system,
        prompt: firstCall.prompt,
        promptPrefix: firstCall.promptPrefix,
        effort: firstCall.effort,
        maxTokens: firstCall.maxTokens,
        model: this.profile.model,
        signal: firstCombined,
      })
    } catch (error) {
      this.settle(firstCall, { ok: false, error })
      throw error
    }
    const relay = new ChunkRelay()
    const final = this.runStreamCloud(args, firstCall, firstInner, firstController, relay)
    return { textStream: relay.iterate(), final }
  }

  private async runStreamCloud(
    args: StreamTextArgs,
    firstCall: Prepared,
    firstInner: ReturnType<AiClient['streamText']>,
    firstController: AbortController,
    relay: ChunkRelay,
  ): Promise<{ text: string; usage: AiUsage; model: string }> {
    const now = this.now
    let chunkSent = false
    const pumpInto = async (
      inner: ReturnType<AiClient['streamText']>,
      call: Prepared,
      isAbandoned: () => boolean,
    ): Promise<{ firstTokenMs: number | null; done: boolean }> => {
      let firstTokenMs: number | null = null
      try {
        for await (const piece of inner.textStream) {
          if (isAbandoned()) return { firstTokenMs, done: false }
          if (firstTokenMs === null && piece.length > 0) firstTokenMs = now() - call.startedMs
          relay.push(piece)
          chunkSent = true
        }
        return { firstTokenMs, done: true }
      } catch {
        return { firstTokenMs, done: false }
      }
    }
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const call =
        attempt === 1
          ? firstCall
          : this.prepare(
              args.task.name,
              'stream',
              args.system,
              args.prompt,
              args.maxTokens,
              args.effort,
              args.promptPrefix,
            )
      if (attempt > 1 && call.promptKey) this.sentPrompts.add(call.promptKey)
      const controller = attempt === 1 ? firstController : new AbortController()
      const combined =
        attempt === 1
          ? args.signal
            ? AbortSignal.any([args.signal, controller.signal])
            : controller.signal
          : (() => {
              const c = controller
              return args.signal ? AbortSignal.any([args.signal, c.signal]) : c.signal
            })()
      let inner: ReturnType<AiClient['streamText']>
      if (attempt === 1) {
        inner = firstInner
      } else {
        try {
          inner = this.innerFor(call).streamText({
            ...args,
            system: call.system,
            prompt: call.prompt,
            promptPrefix: call.promptPrefix,
            effort: call.effort,
            maxTokens: call.maxTokens,
            model: this.profile.model,
            signal: combined,
          })
        } catch (error) {
          this.settle(call, { ok: false, error })
          relay.fail(error)
          throw error
        }
      }
      // Rebuild the combined signal for attempt 1 when the controller above was reused: it is
      // already the signal inner was created with, so no change is needed here.
      void combined
      const stallTimeoutMs = call.productTimeoutMs + STALL_GRACE_MS
      let abandoned = false
      const isAbandoned = () => abandoned
      const pump = pumpInto(inner, call, isAbandoned)
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true
          abandoned = true
          try {
            controller.abort()
          } catch {
            // Aborting never fails the call; the stall below does.
          }
          resolve({ timeout: true })
        }, stallTimeoutMs)
      })
      const innerPromise = inner.final.then(
        (
          result,
        ): {
          timeout: false
          ok: true
          result: { text: string; usage: AiUsage; model: string }
        } => ({
          timeout: false,
          ok: true,
          result,
        }),
        (error): { timeout: false; ok: false; error: unknown } => ({
          timeout: false,
          ok: false,
          error,
        }),
      )
      // Late inner settlement after a cut must not surface as unhandled.
      innerPromise.catch(() => {})
      const raced = await Promise.race([innerPromise, timeoutPromise])
      const callerAborted = args.signal?.aborted === true
      if (raced.timeout) {
        if (timer !== undefined) clearTimeout(timer)
        const pumpResult = await pump
        const stallError = controller.signal.reason ?? new Error('aborted')
        if (attempt === 1) {
          if (chunkSent) {
            const partial = new AppError('AI_ERROR', STALLED_PARTIAL_MESSAGE)
            this.settle(call, { ok: false, error: partial }, pumpResult.firstTokenMs, 0, {
              stalled: true,
            })
            relay.fail(partial)
            throw partial
          }
          this.settle(call, { ok: false, error: stallError }, pumpResult.firstTokenMs, 0, {
            stalled: true,
            trackFailure: false,
          })
          continue
        }
        const doubleStall = new AppError('AI_ERROR', STALLED_MESSAGE)
        this.settle(call, { ok: false, error: doubleStall }, pumpResult.firstTokenMs, 0, {
          stalled: true,
        })
        relay.fail(doubleStall)
        throw doubleStall
      }
      if (timer !== undefined) clearTimeout(timer)
      if (raced.ok) {
        const pumpResult = await pump
        const firstTokenMs = pumpResult.firstTokenMs !== null ? pumpResult.firstTokenMs : null
        this.settle(
          call,
          { ok: true, output: { text: raced.result.text }, usage: raced.result.usage },
          firstTokenMs,
        )
        relay.end()
        return raced.result
      }
      const stalledByAbort = !callerAborted && (timedOut || controller.signal.aborted === true)
      if (stalledByAbort) {
        const pumpResult = await pump
        if (attempt === 1) {
          if (chunkSent) {
            const partial = new AppError('AI_ERROR', STALLED_PARTIAL_MESSAGE)
            this.settle(call, { ok: false, error: partial }, pumpResult.firstTokenMs, 0, {
              stalled: true,
            })
            relay.fail(partial)
            throw partial
          }
          this.settle(call, { ok: false, error: raced.error }, pumpResult.firstTokenMs, 0, {
            stalled: true,
            trackFailure: false,
          })
          abandoned = true
          continue
        }
        const doubleStall = new AppError('AI_ERROR', STALLED_MESSAGE)
        this.settle(call, { ok: false, error: doubleStall }, pumpResult.firstTokenMs, 0, {
          stalled: true,
        })
        relay.fail(doubleStall)
        throw doubleStall
      }
      await pump
      // Normal failure: the pump already holds the stream error, so fail the outer relay with it.
      // pumpInto swallows the stream error, so fail here with the final error.
      this.settle(call, { ok: false, error: raced.error }, null, 0)
      relay.fail(raced.error)
      throw raced.error
    }
    throw new Error('unreachable')
  }

  /** The client a call runs on: the retry client when its think is lowered, else the main one. */
  private innerFor(call: Prepared): AiClient {
    if (call.retry?.think != null && this.retryInner !== undefined) return this.retryInner
    return this.inner
  }

  /** The retry hint of a failed call, or null when a repeat of it may not change the budget. */
  private retryHintOf(
    task: AiTaskName,
    error: CallError,
    contextOverflow: boolean,
  ): RetryHint | null {
    if (this.profile.queue !== 'local' || error.kind !== 'model') return null
    const reason = retryReasonOf(error.message)
    return reason ? { task, reason, contextOverflow } : null
  }

  /** Power state now, or undefined without a reader. A broken reader gives unknown, never a throw. */
  private samplePower(): PowerInfo | undefined {
    if (!this.readPower) return undefined
    try {
      return this.readPower()
    } catch {
      return { ...UNKNOWN_POWER }
    }
  }

  private prepare(
    task: AiTaskName,
    kind: 'object' | 'stream',
    productSystem: string,
    productPrompt: string,
    productMaxTokens: number,
    productEffort: AiEffort,
    productPromptPrefix?: string[],
  ): Prepared {
    // First, so the read is not part of durationMs; it shows in queueMs, since the call is not running yet.
    const power = this.samplePower()
    const seq = this.seq++
    const startedMs = this.now()
    const system = this.lang === 'en' ? EN_SYSTEMS[task] : productSystem
    const prompt = this.lang === 'en' ? translateScaffold(productPrompt) : productPrompt
    const promptPrefix = productPromptPrefix?.length
      ? productPromptPrefix.map((block) => (this.lang === 'en' ? translateScaffold(block) : block))
      : undefined
    const taskTimeout = productTaskTimeout(task, this.provider)
    const fallback = kind === 'stream' ? STREAM_AI_TIMEOUT_MS : DEFAULT_AI_TIMEOUT_MS
    const maxTokensRule = this.productLimits ? 'product' : 'floor'
    const effort = this.deploySettings ? productEffort : this.profile.effort
    const effortRule = this.deploySettings ? 'task' : 'profile'
    const maxTokens = this.productLimits
      ? productMaxTokens
      : Math.max(productMaxTokens, this.profile.maxTokensFloor)
    // Every call of the failed task during its repeat is changed (a split task's failing part is not known).
    const retry =
      this.retrying && this.retrying.task === task
        ? planRetry({
            hint: this.retrying,
            profile: this.profile,
            baseMaxTokens: maxTokens,
            helperThink: this.helperThink,
            hasRetryClient: this.retryInner !== undefined,
            productLimits: this.productLimits,
          })
        : null
    // Without a prefix the key is the same as before the prefix existed.
    const promptKey =
      this.profile.provider === 'ollama'
        ? createHash('sha1')
            .update([task, system, ...(promptPrefix ?? []), prompt].join('\u0000'))
            .digest('hex')
        : null
    return {
      seq,
      task,
      step: this.step,
      kind,
      startedMs,
      startedAt: new Date(startedMs).toISOString(),
      system,
      prompt,
      ...(promptPrefix ? { promptPrefix } : {}),
      maxTokens: retry?.maxTokens ?? maxTokens,
      retry,
      taskEffort: productEffort,
      taskMaxTokens: productMaxTokens,
      maxTokensRule,
      effort,
      effortRule,
      productTimeoutMs: taskTimeout ?? fallback,
      power,
      promptKey,
      promptRepeated: promptKey !== null && this.sentPrompts.has(promptKey),
    }
  }

  /**
   * Takes the next turn on the local lane. The returned function gives the turn up; calling it
   * twice is harmless. If `signal` aborts while waiting, this rejects at once, and the waiter's
   * slot still passes on after the call ahead of it, so later calls are not stuck.
   */
  private async acquire(signal?: AbortSignal): Promise<() => void> {
    const prev = this.lane
    let releaseSlot!: () => void
    this.lane = new Promise<void>((resolve) => {
      releaseSlot = resolve
    })
    let released = false
    const release = () => {
      if (released) return
      released = true
      releaseSlot()
    }
    try {
      await waitTurn(prev, signal)
    } catch (error) {
      prev.then(release)
      throw error
    }
    return release
  }

  private settle(
    call: Prepared,
    outcome: Outcome,
    firstTokenMs: number | null = null,
    queueMs = 0,
    o: { stalled?: boolean; trackFailure?: boolean } = {},
  ): void {
    const durationMs = this.now() - call.startedMs
    const usage = outcome.ok ? outcome.usage : billedUsageOf(outcome.error)
    const ollama = this.ollamaStats.get(call.task) ?? []
    this.ollamaStats.delete(call.task)
    const attempts = this.ollamaAttempts.get(call.task) ?? []
    this.ollamaAttempts.delete(call.task)
    // A prompt that was sent before may be cached, so its reported prompt time is not trusted.
    const promptCacheSuspected =
      call.promptRepeated || ollama.some((s) => promptRateSuspect(s.promptTokens, s.promptMs))
    const detail = callOllama({ durationMs, attempts, promptCacheSuspected })
    const numCtx = this.profile.ollama?.numCtx
    const contextOverflow =
      numCtx !== undefined && usage !== null && usage.inputTokens + usage.outputTokens >= numCtx
    const status = outcome.ok ? undefined : statusOf(outcome.error)
    const error: CallError | null = outcome.ok
      ? null
      : {
          kind: classifyError(outcome.error),
          message: errorMessage(outcome.error),
          ...(status !== undefined ? { status } : {}),
        }
    const record: CallRecord = {
      seq: call.seq,
      task: call.task,
      step: call.step,
      kind: call.kind,
      startedAt: call.startedAt,
      durationMs,
      firstTokenMs: call.kind === 'stream' ? firstTokenMs : null,
      speed: speedOf({
        ok: outcome.ok,
        kind: call.kind,
        durationMs,
        firstTokenMs,
        usage,
        ollama,
        promptCacheSuspected,
      }),
      model: this.profile.model,
      effortRequested: call.effort,
      maxTokens: call.maxTokens,
      taskEffort: call.taskEffort,
      taskMaxTokens: call.taskMaxTokens,
      maxTokensRule: call.maxTokensRule,
      effortRule: call.effortRule,
      productTimeoutMs: call.productTimeoutMs,
      wouldTimeOut: durationMs > call.productTimeoutMs,
      system: call.system,
      prompt: call.prompt,
      ...(call.promptPrefix ? { promptPrefix: call.promptPrefix } : {}),
      output: outcome.ok ? outcome.output : null,
      usage,
      hangulLeft:
        this.lang === 'en'
          ? countHangul([call.system, ...(call.promptPrefix ?? []), call.prompt].join('\n'))
          : null,
      contextOverflow,
      error,
      queueMs,
      waitInclusiveMs: queueMs + durationMs,
      thinkRequested: call.retry?.think ?? thinkFor(this.profile, call.task, this.helperThink),
      ...(detail ? { ollama: detail } : {}),
      ...(call.power ? { power: call.power } : {}),
      ...(call.retry ? { retryBudget: call.retry } : {}),
      ...(o.stalled ? { stalled: true as const } : {}),
    }
    this.records.push(record)
    const trackFailure = o.trackFailure ?? true
    if (
      trackFailure &&
      error &&
      (!this.pendingFailure || SEVERITY[error.kind] > SEVERITY[this.pendingFailure.kind])
    ) {
      this.pendingFailure = error
      this.pendingRetry = this.retryHintOf(call.task, error, contextOverflow)
    }
    mkdirSync(this.callsDir, { recursive: true })
    const file = `${String(call.seq).padStart(3, '0')}-${call.task}.json`
    writeFileSync(join(this.callsDir, file), `${JSON.stringify(record, null, 2)}\n`)
  }
}
