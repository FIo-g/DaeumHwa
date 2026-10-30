import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FAKE_OUTPUTS } from '@/test/ai-fakes'
import type { AiClient } from '@/ai/types'
import type { Extraction } from '@/ai/extraction'
import { CHAPTER_EXTRACT_SYSTEM } from '@/ai/tasks/chapter-extract'
import type { Db } from '@/db/client'
import { proposals } from '@/db/schema'
import type { Actor } from '@/db/types'
import { runChapterCheck } from '@/server/chapter-check'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'

let db: Db
let owner: { id: string; name: string; email: string }
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  workId = work.id
}, 120_000)

const actor = (userId: string): Actor => ({ userId })

/** Answers the chapter extraction with `extraction`; every other task uses its own fake output. */
function extractionClient(extraction: Extraction): AiClient {
  return {
    provider: 'fake',
    defaultModel: 'fake',
    async generateObject(args) {
      const raw =
        args.system === CHAPTER_EXTRACT_SYSTEM
          ? extraction
          : FAKE_OUTPUTS[args.task.name]?.(args.task.input)
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

const extraction = (facts: Extraction['facts']): Extraction => ({
  summary: null,
  entries: [],
  facts,
  threads: [],
  relations: [],
})

const fact = (
  subjectName: string,
  content: string,
  evidence: string,
): Extraction['facts'][number] => ({
  subjectName,
  content,
  evidence,
  suggestedStatus: 'confirmed',
  supersedesFactRef: null,
})

async function factProposals() {
  const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
  return rows.filter((r) => r.type === 'fact_create')
}

describe('runChapterCheck: known facts (G1)', () => {
  it('does not propose a near-duplicate of a wiki fact on the same card', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await createTestFact(db, workId, { content: '종루의 종은 밤마다 떨린다.', entryId: seoyun.id })
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '종루의 종은 밤마다 떨린다고 한다. 서윤은 그 소리를 들었다.',
    })

    const result = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      extractionClient(
        extraction([
          fact('서윤', '종루의 종은 밤마다 떨린다고 한다.', '종루의 종은 밤마다 떨린다고 한다.'),
        ]),
      ),
    )

    expect(await factProposals()).toHaveLength(0)
    expect(result.extraction?.duplicateFacts).toBe(1)
  })

  it('keeps a state change that supersedes a near-identical wiki fact', async () => {
    const serin = await createTestEntry(db, workId, { name: '세린' })
    const old = await createTestFact(db, workId, {
      content: '세린은 북쪽 성문 경비대 소속이다.',
      entryId: serin.id,
    })
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '세린은 남쪽 성문 경비대 소속이다. 그녀는 아침마다 순찰을 돌았다.',
    })

    await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      extractionClient(
        extraction([
          {
            ...fact(
              '세린',
              '세린은 남쪽 성문 경비대 소속이다.',
              '세린은 남쪽 성문 경비대 소속이다.',
            ),
            supersedesFactRef: 'F1',
          },
        ]),
      ),
    )

    const rows = await factProposals()
    expect(rows).toHaveLength(1)
    expect(rows[0].payload).toMatchObject({ supersedesFactId: old.id })
  })

  it('drops a fact whose evidence is altered from the chapter text', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '4층 이상은 철문으로 막혀 있었다.',
    })

    await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      extractionClient(
        extraction([fact('', '4층 이상은 철문로 막혀 있었다.', '4층 이상은 철문로 막혀 있었다.')]),
      ),
    )

    expect(await factProposals()).toHaveLength(0)
  })

  it('stores a whitespace-variant evidence as the manuscript slice', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '서윤은  검을\n쓴다. 그녀는 떠났다.',
    })

    await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      extractionClient(extraction([fact('', '서윤은 검을 쓴다.', '서윤은 검을 쓴다.')])),
    )

    const rows = await factProposals()
    expect(rows).toHaveLength(1)
    expect(rows[0].payload).toMatchObject({ evidence: '서윤은  검을\n쓴다.' })
  })
})
