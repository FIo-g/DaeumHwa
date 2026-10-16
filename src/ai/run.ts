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
  await assertWithinLimit(db, meta.userId)
  const taskModel = task.model?.()
  const runId = await insertRun(db, meta, task.name, taskModel ?? client.defaultModel)
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
    await finishRun(db, runId, { status: 'error', error: aiError.message })
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
  await assertWithinLimit(db, meta.userId)
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
    await finishRun(db, runId, { status: 'error', error: aiError.message })
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
      await finishRun(db, runId, { status: 'error', error: aiError.message })
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
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : DEFAULT_DAILY_TOKEN_LIMIT
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
  | { status: 'error'; error: string }

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
    .set({ status: 'error', error: outcome.error, finishedAt: new Date() })
    .where(eq(aiRuns.id, runId))
}

function toRunError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const reason = error instanceof Error ? error.message : String(error)
  return new AppError('AI_ERROR', `AI 호출에 실패했습니다: ${reason.slice(0, 120)}`)
}
