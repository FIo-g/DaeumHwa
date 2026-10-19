import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FAKE_OUTPUTS } from '@/test/ai-fakes'
import { FakeAiClient } from '@/test/fake-ai'
import type { AiClient } from '@/ai/types'
import { CHAPTER_EXTRACT_SYSTEM } from '@/ai/tasks/chapter-extract'
import {
  CHAPTER_EXTRACT_FACTS_SYSTEM,
  CHAPTER_EXTRACT_RELATIONS_SYSTEM,
  CHAPTER_EXTRACT_THREADS_SYSTEM,
} from '@/ai/tasks/chapter-extract-parts'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import type { Actor } from '@/db/types'
import { AppError } from '@/lib/errors'
import { runChapterCheck } from '@/server/chapter-check'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestEntry, createTestUser, createTestWork } from '@/test/factories'

// Split extraction (local providers) inside the chapter check. Same setup as the HX5 file, with a
// client that counts its calls.

let db: Db
let owner: { id: string; name: string; email: string }

beforeEach(async () => {
  db = await createTestDb()
  owner = await createTestUser(db)
}, 120_000)

function actor(userId: string): Actor {
  return { userId }
}

/**
 * Scripted client: `pick` returns the object for a system prompt, or undefined for its fake.
 * `onCall` reports each call's start and end, so the test can count the calls in flight.
 */
function scriptedClient(
  pick: (system: string) => unknown,
  options: { provider?: string; onCall?: (event: 'start' | 'end', taskName: string) => void } = {},
): AiClient {
  return {
    provider: options.provider ?? 'fake',
    defaultModel: 'fake',
    async generateObject(args) {
      options.onCall?.('start', args.task.name)
      try {
        await new Promise((resolve) => setTimeout(resolve, 5))
        const scripted = pick(args.system)
        const raw =
          scripted === undefined ? FAKE_OUTPUTS[args.task.name]?.(args.task.input) : scripted
        return {
          object: args.schema.parse(raw),
          usage: { inputTokens: 0, outputTokens: 0 },
          model: 'scripted',
        }
      } finally {
        options.onCall?.('end', args.task.name)
      }
    },
    streamText() {
      throw new Error('not used')
    },
  }
}

const SENTENCE = '서윤은 검을 쓴다.'
const fact = {
  subjectName: '서윤',
  content: SENTENCE,
  evidence: SENTENCE,
  suggestedStatus: 'confirmed',
  supersedesFactRef: null,
}

/** A fresh work with one chapter (the body is SENTENCE) and the card 서윤. */
async function freshChapter(): Promise<{ workId: string; chapterId: string }> {
  const work = await createTestWork(db, owner.id)
  const chapter = await createTestChapter(db, work.id, { position: 1, body: SENTENCE })
  await createTestEntry(db, work.id, { name: '서윤' })
  return { workId: work.id, chapterId: chapter.id }
}

/** The extraction answers of the single call, split into the three part answers the same way. */
const EXTRACTION = {
  summary: null,
  entries: [],
  facts: [fact, { ...fact, content: '서윤은 검을 쓴다', evidence: SENTENCE }],
  threads: [],
  relations: [
    {
      sourceName: '서윤',
      targetName: '지후',
      kind: '동료',
      description: '',
      evidence: SENTENCE,
    },
  ],
}

/** Answers the single call and the three parts with the same extraction, split by part. */
function partsAnswer(system: string): unknown {
  if (system === CHAPTER_EXTRACT_SYSTEM) return EXTRACTION
  if (system === CHAPTER_EXTRACT_FACTS_SYSTEM) {
    return { summary: null, entries: [], facts: EXTRACTION.facts }
  }
  if (system === CHAPTER_EXTRACT_THREADS_SYSTEM) return { threads: [] }
  if (system === CHAPTER_EXTRACT_RELATIONS_SYSTEM) return { relations: EXTRACTION.relations }
  return undefined
}

async function runNames(workId: string): Promise<string[]> {
  const rows = await db.select().from(aiRuns).where(eq(aiRuns.userId, owner.id))
  return rows.filter((row) => row.workId === workId).map((row) => row.task)
}

describe('runChapterCheck: split extraction', () => {
  it('local provider runs continuity plus three extract parts', async () => {
    const { workId, chapterId } = await freshChapter()
    const client = scriptedClient(() => undefined, { provider: 'ollama' })

    const result = await runChapterCheck(db, actor(owner.id), { chapterId }, client)

    expect((await runNames(workId)).sort()).toEqual([
      'chapter-extract-facts',
      'chapter-extract-relations',
      'chapter-extract-threads',
      'continuity-check',
    ])
    expect(result.runIds).toHaveLength(4)
  })

  it('at most two ai runs are running at once', async () => {
    const { workId, chapterId } = await freshChapter()
    let inFlight = 0
    let max = 0
    const client = scriptedClient(() => undefined, {
      provider: 'ollama',
      onCall: (event) => {
        inFlight += event === 'start' ? 1 : -1
        max = Math.max(max, inFlight)
      },
    })

    await runChapterCheck(db, actor(owner.id), { chapterId }, client)

    expect(max).toBe(2)
    expect(await runNames(workId)).toContain('chapter-extract-facts')
  })

  it('proposals from the three parts match the single-call result', async () => {
    const single = await freshChapter()
    const singleResult = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: single.chapterId },
      new FakeAiClient(),
    )

    const split = await freshChapter()
    const splitClient = scriptedClient(() => undefined, { provider: 'ollama' })
    const splitResult = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: split.chapterId },
      splitClient,
    )

    expect(await runNames(split.workId)).toContain('chapter-extract-facts')
    expect(splitResult.proposals.map((p) => p.type)).toEqual(
      singleResult.proposals.map((p) => p.type),
    )
    // Ids differ between the two works, so the comparison uses the text of each proposal.
    const texts = (rows: { payload: unknown }[]) =>
      rows.map((row) => {
        const payload = row.payload as { content?: string; name?: string }
        return payload.content ?? payload.name ?? null
      })
    expect(texts(splitResult.proposals)).toEqual(texts(singleResult.proposals))
  })

  it('post_chapter proposals use the facts run id as sourceRef', async () => {
    const { chapterId } = await freshChapter()
    const client = scriptedClient(partsAnswer, { provider: 'ollama' })

    const result = await runChapterCheck(db, actor(owner.id), { chapterId }, client)

    const sourced = result.proposals.filter((p) => p.source === 'post_chapter')
    expect(sourced.length).toBeGreaterThan(0)
    for (const proposal of sourced) {
      expect(proposal.sourceRef).toBe(result.runIds[1])
    }
  })

  it('a failed part reports the real error and finalizes every row', async () => {
    const { workId, chapterId } = await freshChapter()
    const client = scriptedClient(
      (system) => {
        if (system === CHAPTER_EXTRACT_THREADS_SYSTEM) throw new Error('모델 오류')
        return undefined
      },
      { provider: 'ollama' },
    )

    const error = await runChapterCheck(db, actor(owner.id), { chapterId }, client).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('AI_ERROR')
    expect((error as AppError).message).toContain('모델 오류')
    const rows = await db.select().from(aiRuns).where(eq(aiRuns.userId, owner.id))
    expect(rows.filter((row) => row.workId === workId).map((row) => row.status)).not.toContain(
      'running',
    )
  })

  it('split mode keeps the extraction counters', async () => {
    const single = await freshChapter()
    const singleResult = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: single.chapterId },
      scriptedClient(partsAnswer),
    )

    const split = await freshChapter()
    const splitResult = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: split.chapterId },
      scriptedClient(partsAnswer, { provider: 'ollama' }),
    )

    expect(splitResult.extraction).toBeDefined()
    for (const key of [
      'fragmentNamesFixed',
      'relationsDropped',
      'duplicateFacts',
      'unverifiedEvidence',
    ] as const) {
      expect(typeof splitResult.extraction?.[key]).toBe('number')
    }
    expect(splitResult.extraction).toEqual(singleResult.extraction)
    expect(splitResult.extraction?.relationsDropped).toBe(1)
    expect(splitResult.extraction?.duplicateFacts).toBe(1)
  })
})
