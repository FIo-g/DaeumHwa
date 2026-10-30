import { beforeEach, describe, expect, it } from 'vitest'
import { FAKE_OUTPUTS } from '@/test/ai-fakes'
import type { AiClient } from '@/ai/types'
import { CHAPTER_EXTRACT_SYSTEM } from '@/ai/tasks/chapter-extract'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { runChapterCheck } from '@/server/chapter-check'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'

// Measurement wiring (HX5): the chapter check hands the G2 and G1 counters back to the eval.

let db: Db
let owner: { id: string; name: string; email: string }
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  workId = work.id
}, 120_000)

function actor(userId: string): Actor {
  return { userId }
}

/** Scripted client: `pick` returns the object for a task's system prompt, or undefined for its fake. */
function scriptedClient(pick: (system: string) => unknown): AiClient {
  return {
    provider: 'fake',
    defaultModel: 'fake',
    async generateObject(args) {
      const scripted = pick(args.system)
      const raw =
        scripted === undefined ? FAKE_OUTPUTS[args.task.name]?.(args.task.input) : scripted
      return {
        object: args.schema.parse(raw),
        usage: { inputTokens: 0, outputTokens: 0 },
        model: 'scripted',
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

describe('runChapterCheck: extraction counters (HX5)', () => {
  it('returns the G2 and G1 counters as integers', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: SENTENCE })
    await createTestEntry(db, workId, { name: '서윤' })
    // The relation's end 지후 matches no card (G2 counts it); the second fact is a near-duplicate
    // of the first within this extraction (G1 counts it).
    const client = scriptedClient((system) =>
      system === CHAPTER_EXTRACT_SYSTEM
        ? {
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
        : undefined,
    )

    const result = await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, client)

    expect(result.extraction).toEqual({
      fragmentNamesFixed: 0,
      relationsDropped: 1,
      duplicateFacts: 1,
      unverifiedEvidence: 0,
      // P10: the scripted evidence names 서윤, so no weak evidence is counted.
      weakFactEvidence: 0,
      weakThreadEvidence: 0,
    })
    for (const value of Object.values(result.extraction ?? {})) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('keeps the proposals as before the counters were added', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: SENTENCE })
    await createTestEntry(db, workId, { name: '서윤' })
    const client = scriptedClient((system) =>
      system === CHAPTER_EXTRACT_SYSTEM
        ? {
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
        : undefined,
    )

    const result = await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, client)

    expect(result.proposals.map((p) => p.type)).toEqual(['fact_create'])
    expect(result.proposals[0]?.payload).toMatchObject({
      entryId: expect.any(String),
      content: SENTENCE,
    })
  })
})
