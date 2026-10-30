import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { setAiClientForTests } from '@/ai'
import {
  AI_CANCELLED_MESSAGE,
  AI_TIMEOUT_MESSAGE,
  DEFAULT_AI_TIMEOUT_MS,
  DEFAULT_CLOUD_SPLIT_CONCURRENCY,
  runAiTaskSplit,
  setAiTimeoutOverride,
} from '@/ai/run'
import type { AiClient, AiTaskDef, GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'

type Part = { q: string }
type Out = { text: string }

const task: AiTaskDef<Part, Out> = {
  name: 'proofread',
  effort: 'low',
  maxTokens: 100,
  system: '시스템',
  buildPrompt: (input) => input.q,
  schema: z.object({ text: z.string() }),
}

/** Joins the part texts in the order `merge` receives them. */
const joinMerge = (outputs: Out[]): Out => ({ text: outputs.map((o) => o.text).join('|') })

type CallArgs = Pick<GenerateObjectArgs<unknown>, 'task' | 'signal' | 'timeoutMs' | 'model'>
type Behave = (args: CallArgs) => Promise<unknown>

/** The answer a healthy part gets: `답: <q>`. */
const answer: Behave = async (args) => ({ text: `답: ${(args.task.input as Part).q}` })

/** Never settles on its own; rejects with AbortError when the call's signal aborts. */
const never = new Promise<never>(() => {})

/** Waits for `promise`, but rejects with AbortError as soon as `signal` aborts. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('aborted', 'AbortError'))
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/** Records every call, tracks calls in flight, and answers through `behave`. */
class RecordingClient implements AiClient {
  readonly defaultModel = 'fake-model'
  readonly calls: CallArgs[] = []
  maxInFlight = 0
  private inFlight = 0
  private waiters: { count: number; resolve: () => void }[] = []

  constructor(
    readonly provider: string,
    private readonly behave: Behave = answer,
  ) {}

  async generateObject<T>(args: GenerateObjectArgs<T>) {
    this.calls.push(args)
    this.inFlight += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    this.notifyWaiters()
    try {
      const object = (await this.behave(args)) as T
      return {
        object,
        usage: { inputTokens: 10, outputTokens: 5 },
        model: args.model ?? this.defaultModel,
      }
    } finally {
      this.inFlight -= 1
    }
  }

  streamText(): never {
    throw new Error('streamText is not used by the split helper')
  }

  /** Resolves once `count` calls are in flight at the same time. Fails after 2 s instead of hanging. */
  waitForInFlight(count: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        count,
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
      }
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        reject(new Error(`expected ${count} calls in flight, saw at most ${this.maxInFlight}`))
      }, 2000)
      this.waiters.push(waiter)
      this.notifyWaiters()
    })
  }

  private notifyWaiters(): void {
    this.waiters = this.waiters.filter((waiter) => {
      if (this.inFlight < waiter.count) return true
      waiter.resolve()
      return false
    })
  }
}

/** A client whose calls hold until `release` resolves (or the call's signal aborts). */
function gatedClient(provider: string, release: Promise<void>): RecordingClient {
  return new RecordingClient(provider, async (args) => {
    await abortable(release, args.signal)
    return answer(args)
  })
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const ENV_KEYS = ['AI_DAILY_TOKEN_LIMIT', 'AI_SPLIT_CONCURRENCY'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  delete process.env.AI_DAILY_TOKEN_LIMIT
  delete process.env.AI_SPLIT_CONCURRENCY
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  setAiTimeoutOverride(null)
  setAiClientForTests(null)
})

async function setup(): Promise<{ db: Db; userId: string; workId: string }> {
  const db = await createTestDb()
  const user = await createTestUser(db)
  const work = await createTestWork(db, user.id)
  return { db, userId: user.id, workId: work.id }
}

async function insertRun(
  db: Db,
  userId: string,
  values: { status?: 'done' | 'running' | 'error'; inputTokens?: number; outputTokens?: number },
): Promise<void> {
  await db.insert(aiRuns).values({
    userId,
    task: 'proofread',
    status: values.status ?? 'done',
    model: 'test',
    inputTokens: values.inputTokens ?? 0,
    outputTokens: values.outputTokens ?? 0,
  })
}

async function allRuns(db: Db, userId: string) {
  return db.select().from(aiRuns).where(eq(aiRuns.userId, userId))
}

const PARTS: Part[] = [{ q: 'a' }, { q: 'b' }, { q: 'c' }]

describe('runAiTaskSplit', () => {
  it('stores one done ai_runs row for all parts and returns the merged output', async () => {
    const { db, userId, workId } = await setup()
    const client = new RecordingClient('anthropic')
    const { output, runId } = await runAiTaskSplit(
      db,
      { userId, workId },
      task,
      PARTS,
      joinMerge,
      client,
    )

    expect(client.calls).toHaveLength(3)
    expect(output).toEqual({ text: '답: a|답: b|답: c' })
    const rows = await allRuns(db, userId)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(runId)
    expect(rows[0].status).toBe('done')
    expect(rows[0].output).toEqual(output)
  })

  it('passes the outputs to merge in part order even when a part finishes last', async () => {
    const { db, userId, workId } = await setup()
    const client = new RecordingClient('anthropic', async (args) => {
      if ((args.task.input as Part).q === 'a') await new Promise((r) => setTimeout(r, 30))
      return answer(args)
    })
    let seen: Out[] = []
    await runAiTaskSplit(
      db,
      { userId, workId },
      task,
      PARTS,
      (outputs) => {
        seen = outputs
        return joinMerge(outputs)
      },
      client,
    )
    expect(seen.map((o) => o.text)).toEqual(['답: a', '답: b', '답: c'])
  })

  it('runs at most DEFAULT_CLOUD_SPLIT_CONCURRENCY (2) parts at once on a cloud provider', async () => {
    expect(DEFAULT_CLOUD_SPLIT_CONCURRENCY).toBe(2)
    const { db, userId, workId } = await setup()
    const release = deferred()
    const client = gatedClient('anthropic', release.promise)
    const parts = [{ q: 'a' }, { q: 'b' }, { q: 'c' }, { q: 'd' }]
    const run = runAiTaskSplit(db, { userId, workId }, task, parts, joinMerge, client)

    await client.waitForInFlight(2)
    await new Promise((r) => setTimeout(r, 20))
    expect(client.calls).toHaveLength(2)
    release.resolve()

    const { output } = await run
    expect(client.maxInFlight).toBe(2)
    expect(client.calls).toHaveLength(4)
    expect(output).toEqual({ text: '답: a|답: b|답: c|답: d' })
  })

  it('runs parts one at a time on local providers by default', async () => {
    for (const provider of ['ollama', 'eval:ollama']) {
      const { db, userId, workId } = await setup()
      const client = new RecordingClient(provider)
      await runAiTaskSplit(db, { userId, workId }, task, [...PARTS, { q: 'd' }], joinMerge, client)
      expect(client.maxInFlight).toBe(1)
      expect(client.calls).toHaveLength(4)
    }
  })

  it('lets options.concurrency and AI_SPLIT_CONCURRENCY raise the limit on local and cloud', async () => {
    for (const provider of ['ollama', 'anthropic']) {
      for (const source of ['option', 'env'] as const) {
        const { db, userId, workId } = await setup()
        if (source === 'env') process.env.AI_SPLIT_CONCURRENCY = '4'
        const release = deferred()
        const client = gatedClient(provider, release.promise)
        const options = source === 'option' ? { concurrency: 4 } : undefined
        const run = runAiTaskSplit(
          db,
          { userId, workId },
          task,
          [...PARTS, { q: 'd' }],
          joinMerge,
          client,
          options,
        )
        await client.waitForInFlight(4)
        release.resolve()
        await run
        expect(client.maxInFlight).toBe(4)
        delete process.env.AI_SPLIT_CONCURRENCY
      }
    }
  })

  it('caps the pool at options.concurrency = 1', async () => {
    const { db, userId, workId } = await setup()
    const client = new RecordingClient('anthropic')
    const { output } = await runAiTaskSplit(
      db,
      { userId, workId },
      task,
      [...PARTS, { q: 'd' }],
      joinMerge,
      client,
      { concurrency: 1 },
    )
    expect(client.maxInFlight).toBe(1)
    expect(output).toEqual({ text: '답: a|답: b|답: c|답: d' })
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to the provider default when options.concurrency is %s',
    async (concurrency) => {
      const { db, userId, workId } = await setup()
      const client = new RecordingClient('ollama')
      const { output, runId } = await runAiTaskSplit(
        db,
        { userId, workId },
        task,
        PARTS,
        joinMerge,
        client,
        { concurrency },
      )
      expect(client.calls).toHaveLength(3)
      expect(output).toEqual({ text: '답: a|답: b|답: c' })
      const [row] = (await allRuns(db, userId)).filter((r) => r.id === runId)
      expect(row.status).toBe('done')
    },
  )

  it('reads AI_SPLIT_CONCURRENCY at call time and ignores invalid values', async () => {
    const { db, userId, workId } = await setup()

    process.env.AI_SPLIT_CONCURRENCY = '3'
    const release = deferred()
    const gated = gatedClient('anthropic', release.promise)
    const run = runAiTaskSplit(
      db,
      { userId, workId },
      task,
      [...PARTS, { q: 'd' }],
      joinMerge,
      gated,
    )
    await gated.waitForInFlight(3)
    release.resolve()
    await run
    expect(gated.maxInFlight).toBe(3)

    for (const raw of ['0', 'abc']) {
      process.env.AI_SPLIT_CONCURRENCY = raw
      const cloudRelease = deferred()
      const cloud = gatedClient('anthropic', cloudRelease.promise)
      const cloudRun = runAiTaskSplit(
        db,
        { userId, workId },
        task,
        [...PARTS, { q: 'd' }],
        joinMerge,
        cloud,
      )
      await cloud.waitForInFlight(2)
      await new Promise((r) => setTimeout(r, 20))
      expect(cloud.calls).toHaveLength(2)
      cloudRelease.resolve()
      await cloudRun
      expect(cloud.maxInFlight).toBe(2)

      const local = new RecordingClient('ollama')
      await runAiTaskSplit(db, { userId, workId }, task, [...PARTS, { q: 'd' }], joinMerge, local)
      expect(local.maxInFlight).toBe(1)
    }
  })

  it('checks the run cap once, not once per part', async () => {
    const { db, userId, workId } = await setup()
    await insertRun(db, userId, { status: 'running' })
    await insertRun(db, userId, { status: 'running' })
    const { output } = await runAiTaskSplit(
      db,
      { userId, workId },
      task,
      PARTS,
      joinMerge,
      new RecordingClient('anthropic'),
    )
    expect(output.text).toBe('답: a|답: b|답: c')
  })

  it('rejects with CONFLICT and adds no row when the cap is already reached', async () => {
    const { db, userId, workId } = await setup()
    await insertRun(db, userId, { status: 'running' })
    await insertRun(db, userId, { status: 'running' })
    await insertRun(db, userId, { status: 'running' })
    const client = new RecordingClient('anthropic')
    await expect(
      runAiTaskSplit(db, { userId, workId }, task, PARTS, joinMerge, client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(client.calls).toHaveLength(0)
    expect(await allRuns(db, userId)).toHaveLength(3)
  })

  it('uses the default timeout for each part when nothing sets one', async () => {
    const { db, userId, workId } = await setup()
    const client = new RecordingClient('anthropic')
    await runAiTaskSplit(db, { userId, workId }, task, PARTS, joinMerge, client)
    for (const call of client.calls) expect(call.timeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS)
  })

  it('takes the timeout from meta, then the task, and the eval override wins over both', async () => {
    const { db, userId, workId } = await setup()

    const fromMeta = new RecordingClient('anthropic')
    await runAiTaskSplit(db, { userId, workId, timeoutMs: 7000 }, task, PARTS, joinMerge, fromMeta)
    for (const call of fromMeta.calls) expect(call.timeoutMs).toBe(7000)

    const timedTask = { ...task, timeoutMs: 9000 }
    const fromTask = new RecordingClient('anthropic')
    await runAiTaskSplit(db, { userId, workId }, timedTask, PARTS, joinMerge, fromTask)
    for (const call of fromTask.calls) expect(call.timeoutMs).toBe(9000)

    setAiTimeoutOverride(5000)
    const overridden = new RecordingClient('anthropic')
    await runAiTaskSplit(
      db,
      { userId, workId, timeoutMs: 7000 },
      timedTask,
      PARTS,
      joinMerge,
      overridden,
    )
    for (const call of overridden.calls) expect(call.timeoutMs).toBe(5000)
  })

  it('post-processes each part against its own input', async () => {
    const { db, userId, workId } = await setup()
    const withQ: AiTaskDef<Part, Out> = {
      ...task,
      postProcess: (out, input) => ({ text: `${out.text}#${input.q}` }),
    }
    let seen: Out[] = []
    await runAiTaskSplit(
      db,
      { userId, workId },
      withQ,
      PARTS,
      (outputs) => {
        seen = outputs
        return joinMerge(outputs)
      },
      new RecordingClient('anthropic'),
    )
    expect(seen.map((o) => o.text)).toEqual(['답: a#a', '답: b#b', '답: c#c'])
  })

  it('fails the whole run when one part fails and does not start later parts', async () => {
    const { db, userId, workId } = await setup()
    const client = new RecordingClient('anthropic', async (args) => {
      if ((args.task.input as Part).q === 'a') throw new Error('boom')
      return answer(args)
    })
    await expect(
      runAiTaskSplit(db, { userId, workId }, task, PARTS, joinMerge, client, { concurrency: 1 }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    expect(client.calls).toHaveLength(1)
    const [row] = await allRuns(db, userId)
    expect(row.status).toBe('error')
  })

  it('aborts running siblings when one part fails and rethrows the first failure', async () => {
    const { db, userId, workId } = await setup()
    const parts = [{ q: 'a' }, { q: 'b' }, { q: 'c' }, { q: 'd' }]
    const client = new RecordingClient('anthropic', async (args) => {
      if ((args.task.input as Part).q === 'c') {
        await client.waitForInFlight(4)
        throw new Error('boom')
      }
      return abortable(never, args.signal)
    })
    const run = runAiTaskSplit(db, { userId, workId }, task, parts, joinMerge, client, {
      concurrency: 4,
    })
    const error = await run.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('AI_ERROR')
    expect((error as AppError).message).toContain('boom')
    for (const call of client.calls.filter((c) => (c.task.input as Part).q !== 'c')) {
      expect(call.signal?.aborted).toBe(true)
    }
    const [row] = await allRuns(db, userId)
    expect(row.status).toBe('error')
  })

  it('cancels with CANCELLED when the caller aborts while parts are running', async () => {
    const { db, userId, workId } = await setup()
    const controller = new AbortController()
    const client = new RecordingClient('anthropic', async (args) => abortable(never, args.signal))
    const run = runAiTaskSplit(
      db,
      { userId, workId, signal: controller.signal },
      task,
      PARTS,
      joinMerge,
      client,
    )
    await client.waitForInFlight(1)
    controller.abort()
    await expect(run).rejects.toMatchObject({
      code: 'CANCELLED',
      message: AI_CANCELLED_MESSAGE,
    })
    const [row] = await allRuns(db, userId)
    expect(row.status).toBe('error')
  })

  it('fails with the timeout message when the part deadline passes', async () => {
    const { db, userId, workId } = await setup()
    const client = new RecordingClient('anthropic', async (args) => abortable(never, args.signal))
    await expect(
      runAiTaskSplit(db, { userId, workId, timeoutMs: 20 }, task, PARTS, joinMerge, client),
    ).rejects.toMatchObject({ code: 'AI_ERROR', message: AI_TIMEOUT_MESSAGE })
    const [row] = await allRuns(db, userId)
    expect(row.status).toBe('error')
  })

  it('sums usage over all parts, and adds the usage of a failed part', async () => {
    const { db, userId, workId } = await setup()
    await runAiTaskSplit(
      db,
      { userId, workId },
      task,
      PARTS,
      joinMerge,
      new RecordingClient('anthropic'),
    )
    const [done] = await allRuns(db, userId)
    expect(done.inputTokens).toBe(30)
    expect(done.outputTokens).toBe(15)

    const other = await setup()
    const failing = new RecordingClient('anthropic', async (args) => {
      if ((args.task.input as Part).q === 'b') {
        throw new AppError('AI_ERROR', '응답이 끊겼습니다.', {
          usage: { inputTokens: 7, outputTokens: 3 },
        })
      }
      return answer(args)
    })
    await expect(
      runAiTaskSplit(
        other.db,
        { userId: other.userId, workId: other.workId },
        task,
        PARTS,
        joinMerge,
        failing,
        {
          concurrency: 1,
        },
      ),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    const [errorRow] = await allRuns(other.db, other.userId)
    expect(errorRow.status).toBe('error')
    expect(errorRow.inputTokens).toBe(17)
    expect(errorRow.outputTokens).toBe(8)
  })

  it('rejects an empty part list with VALIDATION and stores no row', async () => {
    const { db, userId, workId } = await setup()
    await expect(
      runAiTaskSplit(db, { userId, workId }, task, [], joinMerge, new RecordingClient('anthropic')),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(await allRuns(db, userId)).toHaveLength(0)
  })

  it('records an error when merge throws', async () => {
    const { db, userId, workId } = await setup()
    await expect(
      runAiTaskSplit(
        db,
        { userId, workId },
        task,
        PARTS,
        () => {
          throw new Error('x')
        },
        new RecordingClient('anthropic'),
      ),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    const [row] = await allRuns(db, userId)
    expect(row.status).toBe('error')
  })

  it('aborts the sibling and records an error when buildPrompt throws for one part', async () => {
    const { db, userId, workId } = await setup()
    const throwing: AiTaskDef<Part, Out> = {
      ...task,
      buildPrompt: (input) => {
        if (input.q === 'b') throw new Error('bad prompt')
        return input.q
      },
    }
    const client = new RecordingClient('anthropic', async (args) => abortable(never, args.signal))
    await expect(
      runAiTaskSplit(db, { userId, workId }, throwing, PARTS.slice(0, 2), joinMerge, client, {
        concurrency: 2,
      }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    expect(client.calls[0].signal?.aborted).toBe(true)
    const rows = await allRuns(db, userId)
    expect(rows.map((r) => r.status)).toEqual(['error'])
  })

  it('aborts the sibling and records an error when postProcess throws for one part', async () => {
    const { db, userId, workId } = await setup()
    const throwing: AiTaskDef<Part, Out> = {
      ...task,
      postProcess: (out, input) => {
        if (input.q === 'b') throw new Error('bad output')
        return out
      },
    }
    const client = new RecordingClient('anthropic', async (args) => {
      if ((args.task.input as Part).q === 'a') return abortable(never, args.signal)
      return answer(args)
    })
    await expect(
      runAiTaskSplit(db, { userId, workId }, throwing, PARTS.slice(0, 2), joinMerge, client, {
        concurrency: 2,
      }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    expect(client.calls[0].signal?.aborted).toBe(true)
    const rows = await allRuns(db, userId)
    expect(rows.map((r) => r.status)).toEqual(['error'])
  })

  it('reports each finished call to onPart, and a throwing hook does not change the result', async () => {
    const { db, userId, workId } = await setup()
    const client = new RecordingClient('anthropic', async (args) => {
      if ((args.task.input as Part).q === 'b') throw new Error('boom')
      return answer(args)
    })
    const reports: { index: number; elapsedMs: number; ok: boolean }[] = []
    await expect(
      runAiTaskSplit(db, { userId, workId }, task, PARTS, joinMerge, client, {
        concurrency: 3,
        onPart: (info) => reports.push(info),
      }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    expect(reports.map((r) => r.index).sort()).toEqual([0, 1, 2])
    for (const report of reports) expect(report.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(reports.find((r) => r.index === 1)?.ok).toBe(false)
    expect(reports.filter((r) => r.ok)).toHaveLength(2)

    const { output } = await runAiTaskSplit(
      db,
      { userId, workId },
      task,
      PARTS,
      joinMerge,
      new RecordingClient('anthropic'),
      {
        onPart: () => {
          throw new Error('hook failed')
        },
      },
    )
    expect(output.text).toBe('답: a|답: b|답: c')
  })
})
