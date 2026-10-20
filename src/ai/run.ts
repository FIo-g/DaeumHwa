import { createHash } from 'node:crypto'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import type { Actor, AiRunRow, AiTaskName } from '@/db/types'
import { getAiClient } from '@/ai'
import {
  AI_CANCELLED_MESSAGE,
  AI_TIMEOUT_MESSAGE,
  type AiClient,
  type AiEffort,
  type AiTaskDef,
  type AiUsage,
} from '@/ai/types'
import { TextChannel } from '@/ai/anthropic'
import { seoulDayStart } from '@/lib/dates'
import { AppError } from '@/lib/errors'
import { requireWorkRole } from '@/server/access'

export { AI_CANCELLED_MESSAGE, AI_TIMEOUT_MESSAGE }

const DEFAULT_DAILY_TOKEN_LIMIT = 3_000_000
const LIMIT_MESSAGE = '오늘 AI 사용량 한도를 넘었습니다. 내일 다시 시도해 주세요.'
/** At most this many AI runs may be `running` per user at once. */
const MAX_RUNNING_RUNS = 3
/** Running rows older than this are treated as abandoned and do not count toward the cap. */
const RUNNING_STALE_MS = 10 * 60 * 1000
const CONCURRENCY_MESSAGE = '진행 중인 AI 작업이 너무 많습니다. 끝난 뒤 다시 시도해 주세요.'
/** Time limit for a structured call when neither the meta nor the task sets one. */
export const DEFAULT_AI_TIMEOUT_MS = 120_000
/** Time limit for a streamed text call (drafts). */
export const STREAM_AI_TIMEOUT_MS = 280_000

/**
 * Eval harness only: overrides every call's time limit while set. Null (the default) restores the
 * normal limits. Product code never calls it.
 */
let timeoutOverrideMs: number | null = null

export function setAiTimeoutOverride(ms: number | null): void {
  timeoutOverrideMs = ms
}

/**
 * `signal` cancels the call (the run is recorded as `error` with 취소했습니다.). `timeoutMs`
 * overrides the task's own limit.
 */
export type AiRunMeta = {
  userId: string
  workId: string | null
  chapterId?: string | null
  signal?: AbortSignal
  timeoutMs?: number
}

export interface StreamRunArgs {
  task: AiTaskName
  input: unknown
  effort: AiEffort
  maxTokens: number
  system: string
  prompt: string
  model?: string
  /** Leading blocks sent ahead of `prompt`; see AiTaskDef.buildPromptPrefix. */
  promptPrefix?: string[]
}

/**
 * Provider cache key for one work: the same work always gets the same key, and no work's text is
 * sent in clear. 16 hex characters of a SHA-256 of the work id, prefixed with `w`.
 */
export function cacheKeyFor(workId: string): string {
  return `w${createHash('sha256').update(workId).digest('hex').slice(0, 16)}`
}

/** Prefix and cache key for one call. Each is left out when there is nothing to send. */
function cacheArgs(meta: AiRunMeta, promptPrefix: string[] | undefined) {
  return {
    ...(promptPrefix?.length ? { promptPrefix } : {}),
    ...(meta.workId ? { cacheKey: cacheKeyFor(meta.workId) } : {}),
  }
}

/**
 * One overall deadline for a call: `signal` is the caller's cancel plus the deadline, so every retry
 * and the whole stream stay inside `timeoutMs`. `deadline` alone tells a timeout from a cancel.
 */
function callSignals(
  meta: AiRunMeta,
  timeoutMs: number,
): { signal: AbortSignal; deadline: AbortSignal } {
  const deadline = AbortSignal.timeout(timeoutMs)
  const signal = meta.signal ? AbortSignal.any([meta.signal, deadline]) : deadline
  return { signal, deadline }
}

/**
 * Runs one structured AI task and records it in `ai_runs`. Checks the daily token limit first.
 * Post-processing runs before the output is stored. Failures are recorded as `error` runs and
 * rethrown as AppError('AI_ERROR').
 */
export async function runAiTask<I, O>(
  db: Db,
  meta: AiRunMeta,
  task: AiTaskDef<I, O>,
  input: I,
  client: AiClient = getAiClient(),
): Promise<{ output: O; runId: string }> {
  await assertCanStartRun(db, meta.userId)
  const taskModel = task.model?.()
  const runId = await insertRun(db, meta, task.name, taskModel ?? client.defaultModel)
  let usage: AiUsage | undefined
  const timeoutMs = timeoutOverrideMs ?? meta.timeoutMs ?? task.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS
  const { signal, deadline } = callSignals(meta, timeoutMs)
  try {
    if (meta.signal?.aborted) throw cancelledError()
    const result = await client.generateObject({
      task: { name: task.name, input },
      system: task.system,
      prompt: task.buildPrompt(input),
      ...cacheArgs(meta, task.buildPromptPrefix?.(input)),
      schema: task.schema,
      effort: task.effort,
      maxTokens: task.maxTokens,
      model: taskModel,
      signal,
      timeoutMs,
    })
    usage = result.usage
    const output = task.postProcess ? task.postProcess(result.object, input) : result.object
    // A cancel that landed while the answer was in flight wins: the run is stored as cancelled.
    if (meta.signal?.aborted) throw cancelledError()
    await finishRun(db, runId, {
      status: 'done',
      usage: result.usage,
      model: result.model,
      output,
    })
    return { output, runId }
  } catch (error) {
    const aiError = toRunError(error, meta.signal, deadline)
    // Tokens billed before the failure still count toward the daily limit.
    await finishRun(db, runId, {
      status: 'error',
      error: aiError.message,
      usage: usageFromError(error) ?? usage,
    })
    throw aiError
  }
}

/** Parts of a split run that cloud providers keep in flight at once (both clients retry 429 once). */
export const DEFAULT_CLOUD_SPLIT_CONCURRENCY = 2

/**
 * Runs one task as several calls, one per part, and stores them as ONE `ai_runs` row. Parts run in
 * a small pool. The first failure aborts the running siblings and fails the whole run. `runAiTask`
 * is not changed: use this only when the parts can be merged back into one output.
 */
export async function runAiTaskSplit<I, O>(
  db: Db,
  meta: AiRunMeta,
  task: AiTaskDef<I, O>,
  parts: I[],
  merge: (outputs: O[], parts: I[]) => O,
  client: AiClient = getAiClient(),
  options?: {
    concurrency?: number
    onPart?: (info: { index: number; elapsedMs: number; ok: boolean }) => void
  },
): Promise<{ output: O; runId: string }> {
  if (parts.length === 0) throw new AppError('VALIDATION', '실행할 항목이 없습니다.')
  await assertCanStartRun(db, meta.userId)
  const taskModel = task.model?.()
  const runId = await insertRun(db, meta, task.name, taskModel ?? client.defaultModel)
  const timeoutMs = resolveSplitTimeoutMs(meta, task)
  const defaultConcurrency = isLocalProvider(client.provider) ? 1 : DEFAULT_CLOUD_SPLIT_CONCURRENCY
  // A NaN or infinite request would start no worker and store an empty merge as a done run.
  const requestedOption = options?.concurrency
  const requested =
    requestedOption !== undefined && Number.isFinite(requestedOption)
      ? requestedOption
      : (splitConcurrencyFromEnv() ?? defaultConcurrency)
  const concurrency = Math.max(1, Math.min(Math.floor(requested), parts.length))
  const abortSiblings = new AbortController()
  const outputs: O[] = []
  // An object, not loose lets: the pool writes these from closures.
  const state: { usage: AiUsage; model?: string; failure?: AppError } = {
    usage: { inputTokens: 0, outputTokens: 0 },
  }

  const reportPart = (index: number, elapsedMs: number, ok: boolean) => {
    try {
      options?.onPart?.({ index, elapsedMs, ok })
    } catch {
      // A hook must not change the run.
    }
  }

  const runPart = async (index: number): Promise<void> => {
    if (state.failure || meta.signal?.aborted) return
    const part = parts[index]
    let deadline: AbortSignal | undefined
    try {
      const prompt = task.buildPrompt(part)
      const promptPrefix = task.buildPromptPrefix?.(part)
      const partSignal = meta.signal
        ? AbortSignal.any([meta.signal, abortSiblings.signal])
        : abortSiblings.signal
      const callTime = callSignals({ ...meta, signal: partSignal }, timeoutMs)
      deadline = callTime.deadline
      const startedAt = Date.now()
      let result: { object: O; usage: AiUsage; model: string } | undefined
      try {
        result = await client.generateObject({
          task: { name: task.name, input: part },
          system: task.system,
          prompt,
          ...cacheArgs(meta, promptPrefix),
          schema: task.schema,
          effort: task.effort,
          maxTokens: task.maxTokens,
          model: taskModel,
          signal: callTime.signal,
          timeoutMs,
        })
      } finally {
        reportPart(index, Date.now() - startedAt, result !== undefined)
      }
      state.usage = addUsage(state.usage, result.usage)
      if (index === 0) state.model = result.model
      outputs[index] = task.postProcess ? task.postProcess(result.object, part) : result.object
    } catch (error) {
      state.usage = addUsage(state.usage, usageFromError(error))
      if (!state.failure) {
        // The first failure is the one reported. A sibling abort caused by it is not.
        state.failure = toRunError(error, meta.signal, deadline)
        abortSiblings.abort()
      }
    }
  }

  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (nextIndex < parts.length) {
      const index = nextIndex
      nextIndex += 1
      await runPart(index)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  if (meta.signal?.aborted && !state.failure) state.failure = cancelledError()
  if (state.failure) {
    await finishRun(db, runId, {
      status: 'error',
      error: state.failure.message,
      usage: state.usage,
    })
    throw state.failure
  }

  let output: O
  try {
    output = merge(outputs, parts)
    // A cancel that landed while the parts were merging wins, as in runAiTask.
    if (meta.signal?.aborted) throw cancelledError()
  } catch (error) {
    const aiError = toRunError(error, meta.signal)
    await finishRun(db, runId, { status: 'error', error: aiError.message, usage: state.usage })
    throw aiError
  }
  await finishRun(db, runId, {
    status: 'done',
    usage: state.usage,
    model: state.model ?? client.defaultModel,
    output,
  })
  return { output, runId }
}

/** Time limit for each part of a split run: same precedence as runAiTask. */
function resolveSplitTimeoutMs(meta: AiRunMeta, task: { timeoutMs?: number }): number {
  return timeoutOverrideMs ?? meta.timeoutMs ?? task.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS
}

/** Local providers serve one request at a time, so their parts run in order by default. */
export function isLocalProvider(provider: string): boolean {
  return provider === 'ollama' || provider === 'eval:ollama'
}

/** `AI_SPLIT_CONCURRENCY` when it is a positive integer, otherwise undefined. */
function splitConcurrencyFromEnv(): number | undefined {
  const raw = process.env.AI_SPLIT_CONCURRENCY?.trim()
  if (!raw || !/^\d+$/.test(raw)) return undefined
  const parsed = Number(raw)
  return parsed > 0 ? parsed : undefined
}

function addUsage(total: AiUsage, usage: AiUsage | undefined): AiUsage {
  if (!usage) return total
  const result: AiUsage = {
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
  }
  const cacheRead = sumCache(total.cacheReadTokens, usage.cacheReadTokens)
  const cacheWrite = sumCache(total.cacheWriteTokens, usage.cacheWriteTokens)
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
 * Starts a streaming text task. The caller reads `textStream` for live text; `done` resolves
 * with the full text once the stream completes and the run is stored with `output: { text }`.
 */
export async function startAiStream(
  db: Db,
  meta: AiRunMeta,
  args: StreamRunArgs,
  client: AiClient = getAiClient(),
): Promise<{ runId: string; textStream: AsyncIterable<string>; done: Promise<string> }> {
  await assertCanStartRun(db, meta.userId)
  const runId = await insertRun(db, meta, args.task, args.model ?? client.defaultModel)
  const timeoutMs = timeoutOverrideMs ?? meta.timeoutMs ?? STREAM_AI_TIMEOUT_MS
  const { signal, deadline } = callSignals(meta, timeoutMs)
  let stream: ReturnType<AiClient['streamText']>
  let firstTokenMs: number | undefined
  const startedAt = Date.now()
  try {
    if (meta.signal?.aborted) throw cancelledError()
    stream = client.streamText({
      task: { name: args.task, input: args.input },
      system: args.system,
      prompt: args.prompt,
      ...cacheArgs(meta, args.promptPrefix),
      effort: args.effort,
      maxTokens: args.maxTokens,
      model: args.model,
      signal,
      timeoutMs,
    })
  } catch (error) {
    const aiError = toRunError(error, meta.signal, deadline)
    await finishRun(db, runId, {
      status: 'error',
      error: aiError.message,
      usage: usageFromError(error),
    })
    throw aiError
  }
  const pumped = pumpText(stream.textStream, startedAt, (ms) => {
    firstTokenMs = ms
  })
  const done = stream.final.then(
    async (result) => {
      await pumped.settled
      await finishRun(db, runId, {
        status: 'done',
        usage: result.usage,
        model: result.model,
        output: { text: result.text },
        firstTokenMs,
      })
      return result.text
    },
    async (error: unknown) => {
      const aiError = toRunError(error, meta.signal, deadline)
      // Not awaiting the pump here: a source that failed or was aborted may never end.
      await finishRun(db, runId, {
        status: 'error',
        error: aiError.message,
        usage: usageFromError(error),
        firstTokenMs,
      })
      throw aiError
    },
  )
  // Callers that only read the text stream should not trigger an unhandled rejection.
  done.catch(() => {})
  return { runId, textStream: pumped.textStream, done }
}

/**
 * Reads the client's text stream from the start, whether or not the caller reads it, and hands each
 * chunk on through a buffer, unchanged. The first non-empty chunk sets the first-token time when the
 * model sent it. `settled` resolves once the source has ended (a failed source settles too), so on
 * the success path that time is final. Only the success path waits for it.
 */
function pumpText(
  source: AsyncIterable<string>,
  startedAt: number,
  onFirst: (ms: number) => void,
): { textStream: AsyncIterable<string>; settled: Promise<void> } {
  const channel = new TextChannel()
  const settled = (async () => {
    let seen = false
    try {
      for await (const chunk of source) {
        if (!seen && chunk !== '') {
          seen = true
          onFirst(Date.now() - startedAt)
        }
        channel.push(chunk)
      }
      channel.close()
    } catch (error) {
      channel.fail(error)
    }
  })()
  return { textStream: channel.iterable(), settled }
}

/** Sum of input and output tokens of the user's runs since Seoul midnight containing `now`. */
export async function getTodayUsage(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<
        string | number | null
      >`coalesce(sum(${aiRuns.inputTokens} + ${aiRuns.outputTokens}), 0)`,
    })
    .from(aiRuns)
    .where(and(eq(aiRuns.userId, userId), gte(aiRuns.createdAt, seoulDayStart(now))))
  return Number(row?.total ?? 0)
}

/** Throws AI_LIMIT when today's usage has reached AI_DAILY_TOKEN_LIMIT. 0 or less disables the limit. */
export async function assertWithinLimit(db: Db, userId: string): Promise<void> {
  const limit = dailyTokenLimit()
  if (limit <= 0) return
  const used = await getTodayUsage(db, userId)
  if (used >= limit) throw new AppError('AI_LIMIT', LIMIT_MESSAGE)
}

/**
 * Checks both the daily token limit and the per-user concurrency cap before a run starts.
 * The concurrency error uses CONFLICT, not AI_LIMIT, so import jobs do not pause on it.
 */
async function assertCanStartRun(db: Db, userId: string): Promise<void> {
  await assertWithinLimit(db, userId)
  const running = await countRunningRuns(db, userId)
  if (running >= MAX_RUNNING_RUNS) throw new AppError('CONFLICT', CONCURRENCY_MESSAGE)
}

/** Runs this user has in `running` state that started within the stale window. */
async function countRunningRuns(db: Db, userId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | number | null>`count(*)` })
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.userId, userId),
        eq(aiRuns.status, 'running'),
        gte(aiRuns.createdAt, new Date(now.getTime() - RUNNING_STALE_MS)),
      ),
    )
  return Number(row?.total ?? 0)
}

/** Completed runs of one task in a work, newest first. Any work viewer can read them. */
export async function listAiRuns(
  db: Db,
  actor: Actor,
  workId: string,
  o: { task: AiTaskName; chapterId?: string; limit?: number },
): Promise<AiRunRow[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions = [eq(aiRuns.workId, workId), eq(aiRuns.task, o.task), eq(aiRuns.status, 'done')]
  if (o.chapterId) conditions.push(eq(aiRuns.chapterId, o.chapterId))
  return db
    .select()
    .from(aiRuns)
    .where(and(...conditions))
    .orderBy(desc(aiRuns.createdAt))
    .limit(o.limit ?? 20)
}

function dailyTokenLimit(): number {
  const raw = process.env.AI_DAILY_TOKEN_LIMIT
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_TOKEN_LIMIT
  // Operators often copy the documented format, e.g. 3,000,000 or 3_000_000.
  const cleaned = raw.replace(/[,_]/g, '').trim()
  const parsed = cleaned === '' ? Number.NaN : Number(cleaned)
  if (Number.isFinite(parsed)) return parsed
  console.warn(
    `AI_DAILY_TOKEN_LIMIT 값(${raw})을 숫자로 읽을 수 없어 기본값 ${DEFAULT_DAILY_TOKEN_LIMIT}을 사용합니다.`,
  )
  return DEFAULT_DAILY_TOKEN_LIMIT
}

async function insertRun(
  db: Db,
  meta: AiRunMeta,
  task: AiTaskName,
  model: string,
): Promise<string> {
  const [row] = await db
    .insert(aiRuns)
    .values({
      workId: meta.workId,
      userId: meta.userId,
      task,
      chapterId: meta.chapterId ?? null,
      status: 'running',
      model,
    })
    .returning({ id: aiRuns.id })
  return row.id
}

type RunOutcome =
  | {
      status: 'done'
      usage: AiUsage
      model: string
      output: unknown
      firstTokenMs?: number
    }
  | { status: 'error'; error: string; usage?: AiUsage; firstTokenMs?: number }

async function finishRun(db: Db, runId: string, outcome: RunOutcome): Promise<void> {
  if (outcome.status === 'done') {
    await db
      .update(aiRuns)
      .set({
        status: 'done',
        inputTokens: outcome.usage.inputTokens,
        outputTokens: outcome.usage.outputTokens,
        cacheReadTokens: outcome.usage.cacheReadTokens ?? 0,
        cacheWriteTokens: outcome.usage.cacheWriteTokens ?? 0,
        firstTokenMs: outcome.firstTokenMs ?? null,
        model: outcome.model,
        output: outcome.output,
        finishedAt: new Date(),
      })
      .where(eq(aiRuns.id, runId))
    return
  }
  await db
    .update(aiRuns)
    .set({
      status: 'error',
      error: outcome.error,
      inputTokens: outcome.usage?.inputTokens ?? 0,
      outputTokens: outcome.usage?.outputTokens ?? 0,
      cacheReadTokens: outcome.usage?.cacheReadTokens ?? 0,
      cacheWriteTokens: outcome.usage?.cacheWriteTokens ?? 0,
      firstTokenMs: outcome.firstTokenMs ?? null,
      finishedAt: new Date(),
    })
    .where(eq(aiRuns.id, runId))
}

/**
 * Replaces the stored output of a finished run, keeping its status and tokens. Used when a draft
 * gains a continuation or a warning after its stream has already been stored.
 */
export async function replaceRunOutput(db: Db, runId: string, output: unknown): Promise<void> {
  await db.update(aiRuns).set({ output }).where(eq(aiRuns.id, runId))
}

/** Token usage the AI client attached to an error after the API call was billed, if any. */
function usageFromError(error: unknown): AiUsage | undefined {
  if (!(error instanceof AppError)) return undefined
  const details = error.details
  if (typeof details !== 'object' || details === null) return undefined
  const usage = (details as { usage?: Partial<AiUsage> }).usage
  if (!usage || !isTokenCount(usage.inputTokens) || !isTokenCount(usage.outputTokens)) {
    return undefined
  }
  const billed: AiUsage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
  if (isTokenCount(usage.cacheReadTokens)) billed.cacheReadTokens = usage.cacheReadTokens
  if (isTokenCount(usage.cacheWriteTokens)) billed.cacheWriteTokens = usage.cacheWriteTokens
  return billed
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Throws CANCELLED when the caller's signal has fired. Services call it before each write. */
export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelledError()
}

function cancelledError(): AppError {
  return new AppError('CANCELLED', AI_CANCELLED_MESSAGE)
}

function toRunError(error: unknown, signal?: AbortSignal, deadline?: AbortSignal): AppError {
  // A cancel wins over whatever error the client raised while aborting.
  if (signal?.aborted) return cancelledError()
  // The overall deadline ended the call. Clients may report it as a cancel, so it is checked here.
  if (deadline?.aborted) return new AppError('AI_ERROR', AI_TIMEOUT_MESSAGE)
  // Usage details stay on the server; actions forward AppError.details to the browser.
  if (error instanceof AppError) {
    return error.details === undefined ? error : new AppError(error.code, error.message)
  }
  const reason = error instanceof Error ? error.message : String(error)
  return new AppError('AI_ERROR', `AI 호출에 실패했습니다: ${reason.slice(0, 120)}`)
}
