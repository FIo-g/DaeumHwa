import { beforeEach, describe, expect, it } from 'vitest'
import { FAKE_OUTPUTS } from '@/test/ai-fakes'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { CHAPTER_EXTRACT_SYSTEM } from '@/ai/tasks/chapter-extract'
import { runChapterCheck } from '@/server/chapter-check'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'

// G2: a relation to a name with no card is not proposed by a chapter check.

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

/**
 * Scripted client: `pick` receives the task's system prompt and returns the object for that
 * task, or undefined to use the task's own fake output.
 */
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

describe('runChapterCheck: relations with an unknown end (G2)', () => {
  it('a relation to a name with no card is not proposed', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '서윤과 민준은 함께 떠났다.',
    })
    await createTestEntry(db, workId, { name: '서윤', kind: 'character' })
    const client = scriptedClient((system) =>
      system === CHAPTER_EXTRACT_SYSTEM
        ? {
            summary: null,
            entries: [],
            facts: [],
            threads: [],
            relations: [
              {
                sourceName: '서윤',
                targetName: '민준',
                kind: '동료',
                description: '함께 떠난다',
                evidence: '서윤과 민준은 함께 떠났다.',
              },
            ],
          }
        : undefined,
    )

    const result = await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, client)
    expect(result.proposals.filter((p) => p.type === 'relation_create')).toHaveLength(0)
  })
})
