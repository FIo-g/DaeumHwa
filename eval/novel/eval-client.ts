import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chapterExtractTask } from '@/ai/tasks/chapter-extract'
import { continuityCheckTask } from '@/ai/tasks/continuity-check'
import { directionAdviceTask } from '@/ai/tasks/direction-advice'
import { interviewExtractTask } from '@/ai/tasks/interview-extract'
import { interviewQuestionTask } from '@/ai/tasks/interview-question'
import { proofreadTask } from '@/ai/tasks/proofread'
import { readerSimTask } from '@/ai/tasks/reader-sim'
import { styleSuggestTask } from '@/ai/tasks/style-suggest'
import { DEFAULT_AI_TIMEOUT_MS, STREAM_AI_TIMEOUT_MS } from '@/ai/run'
import type { AiClient, AiEffort, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { AppError } from '@/lib/errors'
import type { ModelProfile } from './models'
import { EN_SYSTEMS } from './localize/en-systems'
import { countHangul, translateScaffold } from './localize/scaffold'

// Eval client: wraps the real AI client for one model profile. It forces the eval settings (max
// effort, the profile's model and output floor), optionally swaps prompts to English, and writes one
// JSON record per call. Product code never uses it.

export type FailureKind = 'external-limit' | 'external-network' | 'model'

export type CallRecord = {
  seq: number
  task: AiTaskName
  kind: 'object' | 'stream'
  startedAt: string
  durationMs: number
  model: string
  effortRequested: AiEffort
  maxTokens: number
  productTimeoutMs: number
  wouldTimeOut: boolean
  system: string
  prompt: string
  output: unknown | null
  usage: AiUsage | null
  hangulLeft: number
  contextOverflow: boolean
  error: { kind: FailureKind; message: string; status?: number } | null
}

export interface EvalClientOptions {
  inner: AiClient
  profile: ModelProfile
  lang: 'ko' | 'en'
  callsDir: string
  startSeq?: number
  now?: () => number
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

/** Higher wins when several failures are recorded before one is taken. */
const SEVERITY: Record<FailureKind, number> = { model: 0, 'external-network': 1, 'external-limit': 2 }

/** Task defs that set their own time limit. Tasks without one use the product default. */
const TASK_DEFS: readonly { name: AiTaskName; timeoutMs?: number }[] = [
  chapterExtractTask,
  continuityCheckTask,
  directionAdviceTask,
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
 * refusal, max-tokens and timeout failures are the model's own and stay `model`.
 */
export function classifyError(error: unknown): FailureKind {
  const message = errorMessage(error)
  const status = statusOf(error)
  if (error instanceof AppError && error.code === 'AI_LIMIT') return 'external-limit'
  if (status === 429 || LIMIT_PATTERN.test(message)) return 'external-limit'
  if (status !== undefined && status >= 500) return 'external-network'
  if (hasNetworkCode(error) || NETWORK_PATTERN.test(message)) return 'external-network'
  return 'model'
}

type Prepared = {
  seq: number
  task: AiTaskName
  kind: 'object' | 'stream'
  startedMs: number
  startedAt: string
  system: string
  prompt: string
  maxTokens: number
  productTimeoutMs: number
}

type Outcome = { ok: true; output: unknown; usage: AiUsage } | { ok: false; error: unknown }

export class EvalClient implements AiClient {
  readonly provider: string
  readonly defaultModel: string
  /** Records of this process only. */
  readonly records: CallRecord[] = []
  private seq: number
  /** Most severe failure recorded since the last take. */
  private pendingFailure: CallError | null = null
  private readonly inner: AiClient
  private readonly profile: ModelProfile
  private readonly lang: 'ko' | 'en'
  private readonly callsDir: string
  private readonly now: () => number

  constructor(o: EvalClientOptions) {
    this.inner = o.inner
    this.profile = o.profile
    this.lang = o.lang
    this.callsDir = o.callsDir
    this.now = o.now ?? Date.now
    this.seq = o.startSeq ?? 1
    this.provider = `eval:${o.inner.provider}`
    this.defaultModel = o.profile.model
  }

  get nextSeq(): number {
    return this.seq
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
    const call = this.prepare(args.task.name, 'object', args.system, args.prompt, args.maxTokens)
    const result = await this.inner
      .generateObject<T>({
        ...args,
        system: call.system,
        prompt: call.prompt,
        effort: 'max',
        maxTokens: call.maxTokens,
        model: this.profile.model,
      })
      .catch((error: unknown): never => {
        this.settle(call, { ok: false, error })
        throw error
      })
    this.settle(call, { ok: true, output: result.object, usage: result.usage })
    return result
  }

  streamText(args: StreamTextArgs) {
    const call = this.prepare(args.task.name, 'stream', args.system, args.prompt, args.maxTokens)
    let inner: ReturnType<AiClient['streamText']>
    try {
      inner = this.inner.streamText({
        ...args,
        system: call.system,
        prompt: call.prompt,
        effort: 'max',
        maxTokens: call.maxTokens,
        model: this.profile.model,
      })
    } catch (error) {
      this.settle(call, { ok: false, error })
      throw error
    }
    const final = inner.final.then(
      (result) => {
        this.settle(call, { ok: true, output: { text: result.text }, usage: result.usage })
        return result
      },
      (error: unknown) => {
        this.settle(call, { ok: false, error })
        throw error
      },
    )
    return { textStream: inner.textStream, final }
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
      kind,
      startedMs,
      startedAt: new Date(startedMs).toISOString(),
      system,
      prompt,
      maxTokens: Math.max(productMaxTokens, this.profile.maxTokensFloor),
      productTimeoutMs: taskTimeout ?? fallback,
    }
  }

  private settle(call: Prepared, outcome: Outcome): void {
    const durationMs = this.now() - call.startedMs
    const usage = outcome.ok ? outcome.usage : null
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
      kind: call.kind,
      startedAt: call.startedAt,
      durationMs,
      model: this.profile.model,
      effortRequested: 'max',
      maxTokens: call.maxTokens,
      productTimeoutMs: call.productTimeoutMs,
      wouldTimeOut: durationMs > call.productTimeoutMs,
      system: call.system,
      prompt: call.prompt,
      output: outcome.ok ? outcome.output : null,
      usage,
      hangulLeft: countHangul(`${call.system}\n${call.prompt}`),
      contextOverflow:
        numCtx !== undefined && usage !== null && usage.inputTokens + usage.outputTokens >= numCtx,
      error,
    }
    this.records.push(record)
    if (error && (!this.pendingFailure || SEVERITY[error.kind] > SEVERITY[this.pendingFailure.kind])) {
      this.pendingFailure = error
    }
    mkdirSync(this.callsDir, { recursive: true })
    const file = `${String(call.seq).padStart(3, '0')}-${call.task}.json`
    writeFileSync(join(this.callsDir, file), `${JSON.stringify(record, null, 2)}\n`)
  }
}
