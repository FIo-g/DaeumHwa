import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Extraction } from '@/ai/extraction'
import { FakeAiClient } from '@/test/fake-ai'
import type { GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { proposals } from '@/db/schema'
import type { Actor } from '@/db/types'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestFact, createTestUser, createTestWork } from '@/test/factories'

vi.mock('@/inngest/client', () => ({
  inngest: { send: vi.fn(async () => ({ ids: ['event-1'] })) },
  isInngestEnabled: () => false,
}))

import {
  advanceImportJob,
  appendImportChapters,
  createImportJob,
  startImportJob,
} from '@/server/imports'

/** Returns scripted extraction output for each prompt. */
class ScriptedClient extends FakeAiClient {
  constructor(private readonly respond: (prompt: string) => unknown) {
    super()
  }

  override async generateObject<T>(args: GenerateObjectArgs<T>) {
    const object = args.schema.parse(this.respond(args.prompt))
    return {
      object,
      usage: { inputTokens: 100, outputTokens: 50 },
      model: args.model ?? this.defaultModel,
    }
  }
}

function emptyExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return { summary: null, entries: [], facts: [], threads: [], relations: [], ...overrides }
}

let db: Db
let actor: Actor
let workId: string

beforeEach(async () => {
  vi.stubEnv('INNGEST_EVENT_KEY', '')
  vi.stubEnv('INNGEST_DEV', '')
  db = await createTestDb()
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  workId = work.id
  actor = { userId: owner.id }
})

/** Creates a job with one chapter per entry, starts it and returns the job id. */
async function startedJob(list: { title: string; body: string }[]): Promise<string> {
  const job = await createImportJob(db, actor, {
    workId,
    fileName: 'novel.txt',
    totalChapters: list.length,
  })
  await appendImportChapters(db, actor, { jobId: job.id, chapters: list })
  await startImportJob(db, actor, job.id)
  return job.id
}

async function factProposals() {
  const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
  return rows.filter((r) => r.type === 'fact_create')
}

describe('import: known facts and evidence (G1)', () => {
  it('does not propose a fact that is a near-duplicate of a wiki fact', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await createTestFact(db, workId, { content: '종루의 종은 밤마다 떨린다.', entryId: seoyun.id })
    const jobId = await startedJob([{ title: '1화', body: '종루의 종은 밤마다 떨린다고 한다.' }])

    const client = new ScriptedClient(() =>
      emptyExtraction({
        facts: [
          {
            subjectName: '서윤',
            content: '종루의 종은 밤마다 떨린다고 한다.',
            evidence: '종루의 종은 밤마다 떨린다고 한다.',
            suggestedStatus: 'confirmed',
            supersedesFactRef: null,
          },
        ],
      }),
    )
    await advanceImportJob(db, jobId, { client })

    expect(await factProposals()).toHaveLength(0)
  })

  it('drops a fact whose evidence is not in the chapter body', async () => {
    const jobId = await startedJob([{ title: '1화', body: '서윤은 말이 없었다.' }])

    const client = new ScriptedClient(() =>
      emptyExtraction({
        facts: [
          {
            subjectName: '서윤',
            content: '서윤은 웃었다.',
            evidence: '서윤은 웃었다.',
            suggestedStatus: 'confirmed',
            supersedesFactRef: null,
          },
        ],
      }),
    )
    await advanceImportJob(db, jobId, { client })

    expect(await factProposals()).toHaveLength(0)
  })
})
