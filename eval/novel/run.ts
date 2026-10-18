import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { setAiTimeoutOverride } from '@/ai/run'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import { migrateDb } from '@/db/migrate'
import * as schema from '@/db/schema'
import type { Actor } from '@/db/types'
import { type Answer, type Pending, readPending } from './author-io'
import { type Bible, loadBible } from './bible'
import { EvalClient } from './eval-client'
import { fakeAnswer } from './fake-author'
import { type ModelId, MODEL_PROFILES, createModelClient } from './models'
import {
  type RunConfig,
  type RunState,
  loadConfig,
  loadState,
  newState,
  saveConfig,
  saveState,
} from './state'
import { advice, check, continuity, draft, proofread, proposals, reader } from './steps/chapter'
import { finish } from './steps/finish'
import { interview } from './steps/interview'
import { setup } from './steps/setup'
import { styleReview, styleSuggest } from './steps/style'
import { ExternalFailureError, persist } from './steps/util'

// Resumable step machine for one novel eval run. The plan is fixed by the config; each step either
// finishes ('done') or waits for the author ('pending'). State is saved after every side effect,
// so a rerun picks up at the first unfinished step.

export { withModelRetry } from './steps/util'

export type RunContext = {
  dir: string
  config: RunConfig
  db: Db
  client: EvalClient
  bible: Bible
  actor: Actor
  /** Test and eval shortcut: answers pending items without waiting for a file. */
  autoAuthor?: (p: Pending) => Answer
  /** Test hook: throw once, right after this mark is saved. */
  throwAfter?: string
  /** Test hook: throw once, after a side effect commits and before its mark is set. */
  throwBeforeMark?: (key: string) => boolean
}

export type StepResult = 'done' | 'pending'

export type StepFn = (ctx: RunContext, key: string, state: RunState) => Promise<StepResult>

const STEPS: Record<string, StepFn> = {
  setup,
  interview,
  advice,
  draft,
  proofread,
  check,
  continuity,
  proposals,
  reader,
  'style:suggest': styleSuggest,
  'style:review': styleReview,
  finish,
}

/** 'ch3:draft' runs the 'draft' step; keys without a chapter prefix are their own step name. */
function stepName(key: string): string {
  const match = /^ch\d+:(.+)$/.exec(key)
  return match?.[1] ?? key
}

export type RunCreateOptions = {
  modelId: ModelId
  lang: 'ko' | 'en'
  chapters: number
  questions: number
  maxDraftAttempts: number
  commit: string
}

/** Writes config.json and the first state.json for a new run directory. */
export function createRun(dir: string, o: RunCreateOptions): RunConfig {
  if (existsSync(join(dir, 'config.json'))) throw new Error(`run already exists: ${dir}`)
  const config: RunConfig = {
    runId: randomUUID(),
    modelId: o.modelId,
    lang: o.lang,
    chapters: o.chapters,
    questions: o.questions,
    maxDraftAttempts: o.maxDraftAttempts,
    createdAt: new Date().toISOString(),
    commit: o.commit,
  }
  saveConfig(dir, config)
  saveState(dir, newState(config))
  return config
}

/** Opens the run's file-backed database and AI client. The caller must call `close`. */
export async function openRun(
  dir: string,
  o: { inner?: AiClient; autoAuthor?: boolean } = {},
): Promise<RunContext & { close(): Promise<void> }> {
  const config = loadConfig(dir)
  const state = loadState(dir)
  const profile = MODEL_PROFILES[config.modelId]
  const pg = new PGlite(join(dir, 'db'))
  const db = drizzle(pg, { schema }) as unknown as Db
  await migrateDb(db, 'pglite')
  const bible = loadBible(config.lang)
  // The inner client reports Ollama timings to the eval client, which is built here first.
  const client: EvalClient = new EvalClient({
    inner: o.inner ?? createModelClient(profile, { onStats: (s) => client.onOllamaStats(s) }),
    profile,
    lang: config.lang,
    callsDir: join(dir, 'calls'),
    startSeq: Math.max(1, state.nextSeq),
  })
  setAiTimeoutOverride(profile.timeoutMs)
  // 0 disables the product's daily token limit for eval runs. close() puts the previous value back.
  const previousDailyLimit = process.env.AI_DAILY_TOKEN_LIMIT
  process.env.AI_DAILY_TOKEN_LIMIT = '0'
  return {
    dir,
    config,
    db,
    client,
    bible,
    actor: { userId: state.data.userId ?? '' },
    autoAuthor: o.autoAuthor ? (p) => fakeAnswer(p, bible) : undefined,
    close: async () => {
      // The timeout override has no getter; null is the value a fresh process starts with.
      setAiTimeoutOverride(null)
      if (previousDailyLimit === undefined) delete process.env.AI_DAILY_TOKEN_LIMIT
      else process.env.AI_DAILY_TOKEN_LIMIT = previousDailyLimit
      await pg.close()
    },
  }
}

/** Runs steps from the cursor until the run is done, waiting for the author, or paused. */
export async function runUntilBlocked(ctx: RunContext): Promise<RunState> {
  const state = loadState(ctx.dir)
  state.status = 'running'
  persist(ctx, state)

  for (;;) {
    if (state.cursor >= state.plan.length) {
      state.status = 'done'
      state.message = null
      persist(ctx, state)
      return state
    }
    if (state.data.userId) ctx.actor = { userId: state.data.userId }

    const key = state.plan[state.cursor] as string
    ctx.client.setStep(key)
    let result: StepResult
    try {
      const step = STEPS[stepName(key)]
      if (!step) throw new Error(`no step for ${key}`)
      result = await step(ctx, key, state)
    } catch (error) {
      return pause(ctx, key, error)
    }

    if (result === 'done') {
      state.cursor += 1
      state.message = null
      persist(ctx, state)
      continue
    }
    if (!ctx.autoAuthor) {
      state.status = 'pending'
      state.message = null
      persist(ctx, state)
      return state
    }
    const rejected = join(ctx.dir, 'answer.error.txt')
    if (existsSync(rejected)) {
      return pause(ctx, key, new Error(readFileSync(rejected, 'utf8').trim()))
    }
    const pending = readPending(ctx.dir)
    if (!pending) return pause(ctx, key, new Error(`${key} is pending but has no pending.json`))
    writeFileSync(
      join(ctx.dir, 'answer.json'),
      `${JSON.stringify(ctx.autoAuthor?.(pending), null, 2)}\n`,
    )
  }
}

/**
 * External limits and network errors pause the run; three pauses on one step block it. The state
 * is taken from disk again first: changes made after the last save belong to the failed attempt.
 * Side effects that committed are adopted from the database on the next run.
 */
function pause(ctx: RunContext, key: string, error: unknown): RunState {
  const state = loadState(ctx.dir)
  const failure =
    error instanceof ExternalFailureError ? error.failure : ctx.client.takeLastFailure()
  if (failure && failure.kind !== 'model') {
    state.pauses[key] = (state.pauses[key] ?? 0) + 1
    if (state.pauses[key] >= 3) state.status = 'blocked'
    else state.status = failure.kind === 'external-limit' ? 'paused-limit' : 'paused-error'
    state.message = failure.message
  } else {
    state.status = 'paused-error'
    state.message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  }
  persist(ctx, state)
  return state
}
