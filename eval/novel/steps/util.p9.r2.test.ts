import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FORMAT_MESSAGE, MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { AppError } from '@/lib/errors'
import { MODEL_PROFILES } from '../models'
import { EvalClient } from '../eval-client'
import type { RunContext } from '../run'
import { newState, type RunConfig, type RunState } from '../state'
import { ExternalFailureError, withModelRetry } from './util'

// withModelRetry with a real EvalClient and a scripted inner (P9 retry budget).

const QWEN = MODEL_PROFILES['qwen3.8-27b']
const CLOUD = MODEL_PROFILES['haiku-5.5']
const USAGE: AiUsage = { inputTokens: 10, outputTokens: 5 }
const LABEL = 'ch1:proofread'

const config: RunConfig = {
  runId: 'run-1',
  modelId: 'qwen3.8-27b',
  lang: 'ko',
  chapters: 1,
  questions: 1,
  maxDraftAttempts: 2,
  createdAt: '2026-10-19T00:00:00.000Z',
  commit: 'abc1234',
}

let dir: string
let callsDir: string
let state: RunState

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'novel-util-p9-'))
  callsDir = mkdtempSync(join(tmpdir(), 'novel-util-p9-calls-'))
  state = newState(config)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(callsDir, { recursive: true, force: true })
})

function objectArgs(task: AiTaskName): GenerateObjectArgs<unknown> {
  return {
    task: { name: task, input: {} },
    system: proofreadTask.system,
    prompt: '<manuscript>\nShe go.\n</manuscript>',
    schema: proofreadTask.schema,
    effort: 'medium',
    maxTokens: 16000,
  }
}

/** Inner client that answers from a script: 'ok' gives a result, an Error is thrown. Logs caps. */
function scripted(script: ('ok' | Error)[], caps: number[]): AiClient {
  return {
    provider: 'main',
    defaultModel: 'm',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      caps.push(args.maxTokens)
      const next = script.shift() ?? 'ok'
      if (next instanceof Error) throw next
      return { object: { suggestions: [] } as T, usage: USAGE, model: 'm' }
    },
    streamText(args: StreamTextArgs) {
      caps.push(args.maxTokens)
      const final = Promise.resolve({ text: 'hi', usage: USAGE, model: 'm' })
      return { textStream: (async function* () {})(), final }
    },
  }
}

const cutOff = () =>
  new AppError('AI_ERROR', MAX_TOKENS_MESSAGE, {
    usage: { inputTokens: 1000, outputTokens: 32000 },
  })
const malformed = () => new AppError('AI_ERROR', FORMAT_MESSAGE)

function ctxFor(profile: typeof QWEN, inner: AiClient): RunContext {
  const client = new EvalClient({ inner, profile, lang: 'ko', callsDir })
  return { dir, client } as unknown as RunContext
}

function run(ctx: RunContext) {
  return withModelRetry(ctx, state, LABEL, () => ctx.client.generateObject(objectArgs('proofread')))
}

describe('withModelRetry on a local profile', () => {
  it('repeats a cut-off call with a wider cap', async () => {
    const caps: number[] = []
    const ctx = ctxFor(QWEN, scripted([cutOff(), 'ok'], caps))

    const result = await run(ctx)

    expect(result?.object).toEqual({ suggestions: [] })
    expect(caps).toEqual([32000, 48000])
    expect(state.retried[LABEL]).toBe(1)
    expect(state.failed).toEqual([])
  })

  it('ends the widened budget with the retry', async () => {
    const caps: number[] = []
    const ctx = ctxFor(QWEN, scripted([cutOff(), 'ok'], caps))
    await run(ctx)

    await ctx.client.generateObject(objectArgs('proofread'))
    expect(caps).toEqual([32000, 48000, 32000])
  })

  it('ends the budget when the repeat fails too', async () => {
    const caps: number[] = []
    const ctx = ctxFor(QWEN, scripted([cutOff(), cutOff()], caps))

    expect(await run(ctx)).toBeNull()
    expect(state.failed).toHaveLength(1)

    await ctx.client.generateObject(objectArgs('proofread'))
    expect(caps).toEqual([32000, 48000, 32000])
  })

  it('ends the budget when the repeat raises an external failure', async () => {
    const caps: number[] = []
    const ctx = ctxFor(QWEN, scripted([cutOff(), new AppError('AI_LIMIT', 'limit')], caps))

    await expect(run(ctx)).rejects.toBeInstanceOf(ExternalFailureError)

    await ctx.client.generateObject(objectArgs('proofread'))
    expect(caps).toEqual([32000, 48000, 32000])
  })

  it('repeats a malformed helper answer unchanged when no retry client is given', async () => {
    const caps: number[] = []
    const ctx = ctxFor(QWEN, scripted([malformed(), 'ok'], caps))

    await run(ctx)

    expect(caps).toEqual([32000, 32000])
    const [, second] = ctx.client.records
    expect('retryBudget' in (second ?? {})).toBe(false)
  })

  it('leaves a first-attempt success untouched', async () => {
    const caps: number[] = []
    const ctx = ctxFor(QWEN, scripted(['ok'], caps))

    await run(ctx)

    expect(caps).toEqual([32000])
    expect(state.retried).toEqual({})
  })

  it('pauses the run on an external failure on the first try', async () => {
    const ctx = ctxFor(QWEN, scripted([new AppError('AI_LIMIT', 'limit')], []))

    await expect(run(ctx)).rejects.toBeInstanceOf(ExternalFailureError)
    expect(state.retried).toEqual({})
  })
})

describe('withModelRetry on a cloud profile', () => {
  it('repeats a cut-off call unchanged', async () => {
    const caps: number[] = []
    const ctx = ctxFor(CLOUD, scripted([cutOff(), 'ok'], caps))

    await run(ctx)

    expect(caps).toEqual([32000, 32000])
    expect(ctx.client.records.every((r) => !('retryBudget' in r))).toBe(true)
  })
})
