import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { READER_PERSONAS } from '@/ai/personas'
import { setAiTimeoutOverride } from '@/ai/run'
import { READER_SIM_CLOUD_TIMEOUT_MS } from '@/ai/tasks/reader-sim'
import type { AiClient, GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { runReaderSimulation } from '@/server/ai-features'

const CHAPTER_BODY = 'Then the bell trembled. Nobody answered.'

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id }
}

/** Records the time limit of each call and answers with the inner client. */
class TimeoutSpyClient implements AiClient {
  readonly defaultModel = 'fake'
  readonly timeouts: (number | undefined)[] = []
  private readonly inner: AiClient

  constructor(
    readonly provider: string,
    inner?: AiClient,
  ) {
    this.inner = inner ?? new FakeAiClient()
  }

  async generateObject<T>(args: GenerateObjectArgs<T>) {
    this.timeouts.push(args.timeoutMs)
    return this.inner.generateObject(args)
  }

  streamText(args: Parameters<AiClient['streamText']>[0]) {
    return this.inner.streamText(args)
  }
}

describe('reader simulation time limit and quotes (round 2 P7)', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string
  let chapterId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
    const chapter = await createTestChapter(db, workId, { position: 1, body: CHAPTER_BODY })
    chapterId = chapter.id
  })

  afterEach(() => {
    setAiTimeoutOverride(null)
  })

  it.each(['anthropic', 'opencode', 'test'])(
    'gives a cloud provider (%s) one call with the 270 s limit',
    async (provider) => {
      const client = new TimeoutSpyClient(provider)
      await runReaderSimulation(db, actor, { chapterId }, client)
      expect(client.timeouts).toEqual([READER_SIM_CLOUD_TIMEOUT_MS])
      expect(READER_SIM_CLOUD_TIMEOUT_MS).toBe(270_000)
    },
  )

  it('keeps 120 s for each persona call on a local provider', async () => {
    const client = new TimeoutSpyClient('ollama')
    await runReaderSimulation(db, actor, { chapterId }, client)
    expect(client.timeouts).toHaveLength(READER_PERSONAS.length)
    expect(client.timeouts).toEqual(READER_PERSONAS.map(() => 120_000))
  })

  it('lets the eval override win over the cloud limit', async () => {
    setAiTimeoutOverride(5_000)
    const client = new TimeoutSpyClient('anthropic')
    await runReaderSimulation(db, actor, { chapterId }, client)
    expect(client.timeouts).toEqual([5_000])
  })

  it('stores a case-different quote as the manuscript wording', async () => {
    const inner = new FakeAiClient({
      overrides: {
        'reader-sim': () => ({
          personas: [
            {
              personaId: 'reader-binge',
              rating: 4,
              dropOffRisk: 'low',
              overall: 'ok',
              moments: [{ quote: 'The bell trembled.', reaction: 'moved', comment: 'c' }],
            },
          ],
          summary: 's',
        }),
      },
    })
    const client = new TimeoutSpyClient('test', inner)
    const { result, runId } = await runReaderSimulation(
      db,
      actor,
      { chapterId, personaIds: ['reader-binge'] },
      client,
    )
    expect(result.personas[0].moments.map((m) => m.quote)).toEqual(['the bell trembled.'])

    const [row] = await db
      .select()
      .from(aiRuns)
      .where(and(eq(aiRuns.id, runId), eq(aiRuns.userId, actor.userId)))
    const stored = row.output as { personas: { moments: { quote: string }[] }[] }
    expect(stored.personas[0].moments.map((m) => m.quote)).toEqual(['the bell trembled.'])
  })
})
