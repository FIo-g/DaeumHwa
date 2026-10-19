import { describe, expect, it, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import { READER_PERSONAS } from '@/ai/personas'
import { type ReaderSimInput, type ReaderSimResult, readerSimTask } from '@/ai/tasks/reader-sim'
import { fakeReaderSim } from '@/test/ai-fakes/reader-sim'
import type { AiClient, GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { listReaderSimRuns, runReaderSimulation } from '@/server/ai-features'
import { getChapter } from '@/server/chapters'
import { getWork } from '@/server/works'

const CHAPTER_BODY = '서윤은 문을 열었다. "여기가 어디야?" 그녀가 물었다. 아무도 대답하지 않았다.'

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id, owner }
}

/** Resolves after `ms`, or rejects with AbortError as soon as `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return abortable(new Promise<void>((resolve) => setTimeout(resolve, ms)), signal)
}

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

/** Polls until `condition` holds. Fails after 2 s instead of hanging. */
async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the condition')
    await sleep(5)
  }
}

type Recorded = {
  personaIds: string[]
  prompt: string
  signal?: AbortSignal
  timeoutMs?: number
}

type RecordOptions = {
  /** Answers the calls. Defaults to the deterministic fake. */
  inner?: AiClient
  /** Per-persona delay in ms, keyed by the persona id of the call. */
  delayMs?: Record<string, number>
  /** Delay for every call that has no entry in `delayMs`. */
  defaultDelayMs?: number
  /** Calls never answer; they reject with AbortError when their signal aborts. */
  hold?: boolean
}

/** Wraps the fake client: records each call and tracks how many run at once. */
class RecordingAiClient implements AiClient {
  readonly defaultModel: string
  readonly calls: Recorded[] = []
  maxInFlight = 0
  private inFlight = 0
  private readonly inner: AiClient

  constructor(
    readonly provider: string,
    private readonly options: RecordOptions = {},
  ) {
    this.inner = options.inner ?? new FakeAiClient()
    this.defaultModel = this.inner.defaultModel
  }

  async generateObject<T>(args: GenerateObjectArgs<T>) {
    const personaIds = (args.task.input as ReaderSimInput).personas.map((p) => p.id)
    this.calls.push({
      personaIds,
      prompt: args.prompt,
      signal: args.signal,
      timeoutMs: args.timeoutMs,
    })
    this.inFlight += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    try {
      if (this.options.hold) await abortable(new Promise<never>(() => {}), args.signal)
      const delay = this.options.delayMs?.[personaIds[0]] ?? this.options.defaultDelayMs ?? 0
      if (delay > 0) await sleep(delay, args.signal)
      return await this.inner.generateObject(args)
    } finally {
      this.inFlight -= 1
    }
  }

  streamText(args: Parameters<AiClient['streamText']>[0]) {
    return this.inner.streamText(args)
  }
}

describe('reader simulation per persona', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string
  let chapterId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
    const chapter = await createTestChapter(db, workId, { position: 1, body: CHAPTER_BODY })
    chapterId = chapter.id
  })

  async function doneRows(): Promise<(typeof aiRuns.$inferSelect)[]> {
    return db
      .select()
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.userId, actor.userId),
          eq(aiRuns.task, 'reader-sim'),
          eq(aiRuns.status, 'done'),
        ),
      )
  }

  it('makes one model call per persona, in persona order', async () => {
    const client = new RecordingAiClient('ollama')
    await runReaderSimulation(db, actor, { chapterId }, client)
    expect(client.calls.map((c) => c.personaIds)).toEqual(READER_PERSONAS.map((p) => [p.id]))
  })

  it('makes one call per selected persona', async () => {
    const client = new RecordingAiClient('ollama')
    await runReaderSimulation(
      db,
      actor,
      { chapterId, personaIds: ['reader-binge', 'reader-genre'] },
      client,
    )
    expect(client.calls.map((c) => c.personaIds)).toEqual([['reader-binge'], ['reader-genre']])
  })

  it('keeps the persona order when the calls finish out of order', async () => {
    const client = new RecordingAiClient('ollama', {
      delayMs: {
        'reader-novice': 60,
        'reader-binge': 40,
        'reader-casual': 20,
        'reader-genre': 0,
      },
    })
    const { result } = await runReaderSimulation(db, actor, { chapterId }, client)
    expect(result.personas.map((p) => p.personaId)).toEqual(READER_PERSONAS.map((p) => p.id))
  })

  it('stores exactly one done ai_runs row holding all personas', async () => {
    const { runId, result } = await runReaderSimulation(
      db,
      actor,
      { chapterId },
      new RecordingAiClient('ollama'),
    )
    const rows = await doneRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(runId)
    expect((rows[0].output as ReaderSimResult).personas).toHaveLength(4)
    expect(result.personas).toHaveLength(4)

    const runs = await listReaderSimRuns(db, actor, workId, { chapterId })
    expect(runs.map((r) => r.id)).toEqual([runId])
  })

  it('is not blocked by the run cap that its own calls would hit', async () => {
    for (let i = 0; i < 2; i += 1) {
      await db.insert(aiRuns).values({
        userId: actor.userId,
        workId,
        task: 'reader-sim',
        status: 'running',
        model: 'test',
      })
    }
    const { result } = await runReaderSimulation(
      db,
      actor,
      { chapterId },
      new RecordingAiClient('ollama'),
    )
    expect(result.personas).toHaveLength(4)
  })

  it('gives every call the product time limit of 120 s', async () => {
    const client = new RecordingAiClient('ollama')
    await runReaderSimulation(db, actor, { chapterId }, client)
    expect(client.calls).toHaveLength(4)
    for (const call of client.calls) expect(call.timeoutMs).toBe(120_000)
  })

  it('runs the persona calls one at a time on a local provider', async () => {
    const local = new RecordingAiClient('ollama', { defaultDelayMs: 20 })
    await runReaderSimulation(db, actor, { chapterId }, local)
    expect(local.calls).toHaveLength(4)
    expect(local.maxInFlight).toBe(1)
  })

  it.each(['anthropic', 'test'])(
    'makes exactly one call with all personas on the %s provider (spec 8)',
    async (provider) => {
      const client = new RecordingAiClient(provider, { defaultDelayMs: 5 })
      const { runId, result } = await runReaderSimulation(db, actor, { chapterId }, client)

      expect(client.calls).toHaveLength(1)
      expect(client.calls[0].personaIds).toEqual(READER_PERSONAS.map((p) => p.id))
      expect(client.maxInFlight).toBe(1)

      const chapter = await getChapter(db, actor, chapterId)
      const work = await getWork(db, actor, workId)
      const fullInput: ReaderSimInput = {
        chapterText: chapter.body,
        chapterPosition: chapter.position,
        chapterTitle: chapter.title,
        previousSummaries: [],
        work: { title: work.title, genre: work.genre, logline: work.logline },
        personas: READER_PERSONAS,
      }
      expect(client.calls[0].prompt).toBe(readerSimTask.buildPrompt(fullInput))

      const rows = await doneRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(runId)
      expect(result.personas).toHaveLength(4)
    },
  )

  it('returns a non-empty summary', async () => {
    const { result } = await runReaderSimulation(db, actor, { chapterId }, new FakeAiClient())
    expect(result.summary).not.toBe('')
  })

  it('fails the run and stores no done row when one persona fails', async () => {
    const inner = new FakeAiClient({
      overrides: {
        'reader-sim': (input) => {
          const reader = input as ReaderSimInput
          if (reader.personas.some((p) => p.id === 'reader-casual')) throw new Error('boom')
          return fakeReaderSim(reader)
        },
      },
    })
    await expect(
      runReaderSimulation(db, actor, { chapterId }, new RecordingAiClient('ollama', { inner })),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    expect(await doneRows()).toHaveLength(0)
  })

  it('cancels the whole run and stores no done row when the caller aborts', async () => {
    const client = new RecordingAiClient('ollama', { hold: true })
    const controller = new AbortController()
    const run = runReaderSimulation(db, actor, { chapterId }, client, controller.signal)
    await waitUntil(() => client.calls.length >= 1)
    controller.abort()
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(await doneRows()).toHaveLength(0)
  })

  it('rejects an unknown persona id with the existing VALIDATION message', async () => {
    await expect(
      runReaderSimulation(db, actor, { chapterId, personaIds: ['nope'] }, new FakeAiClient()),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '독자 페르소나를 하나 이상 고르세요.',
    })
  })
})
