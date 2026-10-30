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

// Round 2, P10: the chapter check counts weak evidence and keeps every proposal.

const BODY = '서윤은 검을 쓴다. 바람이 불었다. 닫힌 문은 열리지 않았다.'

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

const anchoredFact = {
  subjectName: '서윤',
  content: '서윤은 검을 쓴다',
  evidence: '서윤은 검을 쓴다.',
  suggestedStatus: 'confirmed',
  supersedesFactRef: null,
}
// The evidence sentence does not name 서윤 (weak).
const weakFact = {
  subjectName: '서윤',
  content: '바람 속에 서 있었다',
  evidence: '바람이 불었다.',
  suggestedStatus: 'confirmed',
  supersedesFactRef: null,
}
const anchoredThread = {
  title: '닫힌 문',
  description: '문이 열리지 않는다',
  kind: 'planted',
  evidence: '닫힌 문은 열리지 않았다.',
  existingThreadRef: null,
  targetChapterPosition: null,
}
// The evidence shares no keyword with the title or description (weak).
const weakThread = {
  title: '푸른 등불',
  description: '등불이 켜졌다',
  kind: 'planted',
  evidence: '바람이 불었다.',
  existingThreadRef: null,
  targetChapterPosition: null,
}

function extractionOutput(facts: unknown[], threads: unknown[]) {
  return {
    summary: null,
    entries: [],
    facts,
    threads,
    relations: [],
  }
}

describe('runChapterCheck: evidence anchor counters (P10)', () => {
  it('counts weak evidence and keeps every proposal', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: BODY })
    await createTestEntry(db, workId, { name: '서윤' })
    const client = scriptedClient((system) =>
      system === CHAPTER_EXTRACT_SYSTEM
        ? extractionOutput([anchoredFact, weakFact], [anchoredThread, weakThread])
        : undefined,
    )

    const result = await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, client)

    expect(result.proposals.map((p) => p.type).sort()).toEqual([
      'fact_create',
      'fact_create',
      'thread_create',
      'thread_create',
    ])
    expect(result.extraction).toMatchObject({
      fragmentNamesFixed: 0,
      relationsDropped: 0,
      duplicateFacts: 0,
      unverifiedEvidence: 0,
      weakFactEvidence: 1,
      weakThreadEvidence: 1,
    })
  })

  it('reports zero weak evidence when every item is anchored', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: BODY })
    await createTestEntry(db, workId, { name: '서윤' })
    const client = scriptedClient((system) =>
      system === CHAPTER_EXTRACT_SYSTEM
        ? extractionOutput([anchoredFact], [anchoredThread])
        : undefined,
    )

    const result = await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, client)

    expect(result.extraction?.weakFactEvidence).toBe(0)
    expect(result.extraction?.weakThreadEvidence).toBe(0)
  })
})
