import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import type { Actor, AiRunRow, AiTaskName } from '@/db/types'
import { getAiClient } from '@/ai'
import type { AiClient, AiEffort, AiTaskDef, AiUsage } from '@/ai/types'
import { seoulDayStart } from '@/lib/dates'
import { AppError } from '@/lib/errors'
import { requireWorkRole } from '@/server/access'

const DEFAULT_DAILY_TOKEN_LIMIT = 3_000_000
const LIMIT_MESSAGE = '오늘 AI 사용량 한도를 넘었습니다. 내일 다시 시도해 주세요.'
/** At most this many AI runs may be `running` per user at once. */
const MAX_RUNNING_RUNS = 3
/** Running rows older than this are treated as abandoned and do not count toward the cap. */
const RUNNING_STALE_MS = 10 * 60 * 1000
const CONCURRENCY_MESSAGE = '진행 중인 AI 작업이 너무 많습니다. 끝난 뒤 다시 시도해 주세요.'

export type AiRunMeta = { userId: string; workId: string | null; chapterId?: string | null }

export interface StreamRunArgs {
  task: AiTaskName
  effort: AiEffort
  maxTokens: number
  system: string
  prompt: string
  fake: () => string
  model?: string
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
  try {
    const result = await client.generateObject({
      system: task.system,
      prompt: task.buildPrompt(input),
      schema: task.schema,
      effort: task.effort,
      maxTokens: task.maxTokens,
      fake: () => task.fake(input),
      model: taskModel,
    })
    usage = result.usage
    const output = task.postProcess ? task.postProcess(result.object, input) : result.object
    await finishRun(db, runId, {
      status: 'done',
      usage: result.usage,
      model: result.model,
      output,
    })
    return { output, runId }
  } catch (error) {
    const aiError = toRunError(error)
    // Tokens billed before the failure still count toward the daily limit.
    await finishRun(db, runId, {
      status: 'error',
      error: aiError.message,
      usage: usageFromError(error) ?? usage,
    })
    throw aiError
  }
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
  let stream: ReturnType<AiClient['streamText']>
  try {
    stream = client.streamText({
      system: args.system,
      prompt: args.prompt,
      effort: args.effort,
      maxTokens: args.maxTokens,
      fake: args.fake,
      model: args.model,
    })
  } catch (error) {
    const aiError = toRunError(error)
    await finishRun(db, runId, {
      status: 'error',
      error: aiError.message,
      usage: usageFromError(error),
    })
    throw aiError
  }
  const done = stream.final.then(
    async (result) => {
      await finishRun(db, runId, {
        status: 'done',
        usage: result.usage,
        model: result.model,
        output: { text: result.text },
      })
      return result.text
    },
    async (error: unknown) => {
      const aiError = toRunError(error)
      await finishRun(db, runId, {
        status: 'error',
        error: aiError.message,
        usage: usageFromError(error),
      })
      throw aiError
    },
  )
  // Callers that only read the text stream should not trigger an unhandled rejection.
  done.catch(() => {})
  return { runId, textStream: stream.textStream, done }
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
  | { status: 'done'; usage: AiUsage; model: string; output: unknown }
  | { status: 'error'; error: string; usage?: AiUsage }

async function finishRun(db: Db, runId: string, outcome: RunOutcome): Promise<void> {
  if (outcome.status === 'done') {
    await db
      .update(aiRuns)
      .set({
        status: 'done',
        inputTokens: outcome.usage.inputTokens,
        outputTokens: outcome.usage.outputTokens,
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
      finishedAt: new Date(),
    })
    .where(eq(aiRuns.id, runId))
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
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function toRunError(error: unknown): AppError {
  // Usage details stay on the server; actions forward AppError.details to the browser.
  if (error instanceof AppError) {
    return error.details === undefined ? error : new AppError(error.code, error.message)
  }
  const reason = error instanceof Error ? error.message : String(error)
  return new AppError('AI_ERROR', `AI 호출에 실패했습니다: ${reason.slice(0, 120)}`)
}
