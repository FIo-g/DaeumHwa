import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chapterExtractTask } from '@/ai/tasks/chapter-extract'
import { continuityCheckTask } from '@/ai/tasks/continuity-check'
import { directionAdviceTask } from '@/ai/tasks/direction-advice'
import { draftRepairTask } from '@/ai/tasks/draft-repair'
import { interviewExtractTask } from '@/ai/tasks/interview-extract'
import { interviewQuestionTask } from '@/ai/tasks/interview-question'
import { proofreadTask } from '@/ai/tasks/proofread'
import { readerSimTask } from '@/ai/tasks/reader-sim'
import { styleSuggestTask } from '@/ai/tasks/style-suggest'
import { DEFAULT_AI_TIMEOUT_MS, STREAM_AI_TIMEOUT_MS } from '@/ai/run'
import type { AiClient, AiEffort, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { OLLAMA_STREAM_FAILURE, type OllamaCallStats, type OllamaThink } from '@/ai/ollama'
import type { AiTaskName } from '@/db/types'
import { AppError } from '@/lib/errors'
import { type HelperThink, type ModelProfile, thinkFor } from './models'
import { EN_SYSTEMS } from './localize/en-systems'
import { countHangul, translateScaffold } from './localize/scaffold'

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
  effortRequested: AiEffort
  maxTokens: number
  productTimeoutMs: number
  wouldTimeOut: boolean
  system: string
  prompt: string
  output: unknown | null
  usage: AiUsage | null
  /** Hangul left in an English run's prompt; null for Korean runs, where it is the whole prompt. */
  hangulLeft: number | null
  contextOverflow: boolean
  error: { kind: FailureKind; message: string; status?: number } | null
  /** ms the call waited for the local lane; 0 when it did not wait or the profile is not local. */
  queueMs?: number
  /** queueMs + durationMs: the wait-inclusive time that durationMs used to hold. */
  waitInclusiveMs?: number
  /** The Ollama `think` value the call asked for; null when the profile has no Ollama settings. */
  thinkRequested?: OllamaThink | null
}

export interface EvalClientOptions {
  inner: AiClient
  profile: ModelProfile
  lang: 'ko' | 'en'
  callsDir: string
  startSeq?: number
  now?: () => number
  /** Think level for helper tasks in a compare run. See `thinkFor` in ./models. */
  helperThink?: HelperThink
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

/**
 * Tokens a failed call was billed. The inner clients attach them to the AppError they throw, so a
 * call that failed after the server answered still counts in the run's totals.
 */
function billedUsageOf(error: unknown): AiUsage | null {
  if (!(error instanceof AppError)) return null
  const usage = (error.details as { usage?: unknown } | undefined)?.usage
  if (typeof usage !== 'object' || usage === null) return null
  const { inputTokens, outputTokens } = usage as Partial<AiUsage>
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return null
  return { inputTokens, outputTokens }
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
      promptTokensPerSec: ratePerSec(
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
  maxTokens: number
  productTimeoutMs: number
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
  /** Ollama timings reported by the inner client, waiting for their call to settle. */
  private readonly ollamaStats = new Map<AiTaskName, OllamaCallStats[]>()
  private step: string | null = null
  /** Tail of the local lane: resolves when the last call that took a turn has released it. */
  private lane: Promise<void> = Promise.resolve()
  private readonly inner: AiClient
  private readonly profile: ModelProfile
  private readonly lang: 'ko' | 'en'
  private readonly callsDir: string
  private readonly now: () => number
  private readonly helperThink: HelperThink | undefined

  constructor(o: EvalClientOptions) {
    this.inner = o.inner
    this.profile = o.profile
    this.lang = o.lang
    this.callsDir = o.callsDir
    this.now = o.now ?? Date.now
    this.seq = o.startSeq ?? 1
    this.provider = `eval:${o.inner.provider}`
    this.defaultModel = o.profile.model
    this.helperThink = o.helperThink
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

  /**
   * Returns the most severe failure recorded since the previous take (external limit, then external
   * network, then model), and clears it. Ties keep the earlier failure.
   */
  takeLastFailure(): CallError | null {
    const failure = this.pendingFailure
    this.pendingFailure = null
    return failure
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
      const call = this.prepare(args.task.name, 'object', args.system, args.prompt, args.maxTokens)
      this.settle(call, { ok: false, error }, null, call.startedMs - requestedMs)
      throw error
    }
    try {
      const call = this.prepare(args.task.name, 'object', args.system, args.prompt, args.maxTokens)
      const queueMs = local ? call.startedMs - requestedMs : 0
      // A synchronous throw from a non-async inner client becomes a rejection, so it is recorded too.
      const pending = (() => {
        try {
          return this.inner.generateObject<T>({
            ...args,
            system: call.system,
            prompt: call.prompt,
            effort: this.profile.effort,
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
    } finally {
      release()
    }
  }

  streamText(args: StreamTextArgs) {
    // Streams are not locked. The eval `draft` step awaits each stream's `done` before any other
    // AI call starts (eval/novel/steps/chapter.ts), so no helper call overlaps a stream.
    const call = this.prepare(args.task.name, 'stream', args.system, args.prompt, args.maxTokens)
    let inner: ReturnType<AiClient['streamText']>
    try {
      inner = this.inner.streamText({
        ...args,
        system: call.system,
        prompt: call.prompt,
        effort: this.profile.effort,
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

  private prepare(
    task: AiTaskName,
    kind: 'object' | 'stream',
    productSystem: string,
    productPrompt: string,
    productMaxTokens: number,
  ): Prepared {
    const seq = this.seq++
    const startedMs = this.now()
    const system = this.lang === 'en' ? EN_SYSTEMS[task] : productSystem
    const prompt = this.lang === 'en' ? translateScaffold(productPrompt) : productPrompt
    const taskTimeout = TASK_DEFS.find((def) => def.name === task)?.timeoutMs
    const fallback = kind === 'stream' ? STREAM_AI_TIMEOUT_MS : DEFAULT_AI_TIMEOUT_MS
    return {
      seq,
      task,
      step: this.step,
      kind,
      startedMs,
      startedAt: new Date(startedMs).toISOString(),
      system,
      prompt,
      maxTokens: Math.max(productMaxTokens, this.profile.maxTokensFloor),
      productTimeoutMs: taskTimeout ?? fallback,
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
  ): void {
    const durationMs = this.now() - call.startedMs
    const usage = outcome.ok ? outcome.usage : billedUsageOf(outcome.error)
    const ollama = this.ollamaStats.get(call.task) ?? []
    this.ollamaStats.delete(call.task)
    const numCtx = this.profile.ollama?.numCtx
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
      }),
      model: this.profile.model,
      effortRequested: this.profile.effort,
      maxTokens: call.maxTokens,
      productTimeoutMs: call.productTimeoutMs,
      wouldTimeOut: durationMs > call.productTimeoutMs,
      system: call.system,
      prompt: call.prompt,
      output: outcome.ok ? outcome.output : null,
      usage,
      hangulLeft: this.lang === 'en' ? countHangul(`${call.system}\n${call.prompt}`) : null,
      contextOverflow:
        numCtx !== undefined && usage !== null && usage.inputTokens + usage.outputTokens >= numCtx,
      error,
      queueMs,
      waitInclusiveMs: queueMs + durationMs,
      thinkRequested: thinkFor(this.profile, call.task, this.helperThink),
    }
    this.records.push(record)
    if (
      error &&
      (!this.pendingFailure || SEVERITY[error.kind] > SEVERITY[this.pendingFailure.kind])
    ) {
      this.pendingFailure = error
    }
    mkdirSync(this.callsDir, { recursive: true })
    const file = `${String(call.seq).padStart(3, '0')}-${call.task}.json`
    writeFileSync(join(this.callsDir, file), `${JSON.stringify(record, null, 2)}\n`)
  }
}
