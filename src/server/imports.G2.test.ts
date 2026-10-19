import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Extraction } from '@/ai/extraction'
import { FakeAiClient } from '@/test/fake-ai'
import type { GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { proposals } from '@/db/schema'
import type { Actor } from '@/db/types'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'

const mocks = vi.hoisted(() => ({
  enabled: false,
  send: vi.fn<(event: unknown) => Promise<{ ids: string[] }>>(async () => ({
    ids: ['event-1'],
  })),
}))

// Inngest is never reached in these tests: the client is mocked so no event is sent.
vi.mock('@/inngest/client', () => ({
  inngest: { send: (event: unknown) => mocks.send(event) },
  isInngestEnabled: () => mocks.enabled,
}))

import {
  advanceImportJob,
  appendImportChapters,
  createImportJob,
  startImportJob,
} from '@/server/imports'

/** Returns scripted extraction output and records every prompt. */
class ScriptedClient extends FakeAiClient {
  readonly prompts: string[] = []

  constructor(private readonly respond: (prompt: string) => unknown) {
    super()
  }

  override async generateObject<T>(args: GenerateObjectArgs<T>) {
    this.prompts.push(args.prompt)
    const object = args.schema.parse(this.respond(args.prompt))
    return {
      object,
      usage: { inputTokens: 100, outputTokens: 50 },
      model: args.model ?? this.defaultModel,
    }
  }
}

function positionOf(prompt: string): number {
  const match = /<manuscript position="(\d+)"/.exec(prompt)
  if (!match) throw new Error('no manuscript position in prompt')
  return Number(match[1])
}

function emptyExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return { summary: null, entries: [], facts: [], threads: [], relations: [], ...overrides }
}

function entryNamed(name: string): Extraction['entries'][number] {
  return { name, kind: 'character', aliases: [], summary: '', fields: [] }
}

describe('import jobs: relations to cards from earlier chapters (G2)', () => {
  let db: Db
  let owner: { id: string; name: string; email: string }
  let workId: string
  let actor: Actor

  beforeEach(async () => {
    vi.stubEnv('INNGEST_EVENT_KEY', '')
    vi.stubEnv('INNGEST_DEV', '')
    mocks.enabled = false
    mocks.send.mockClear()
    db = await createTestDb()
    owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    actor = { userId: owner.id }
  })

  /** Creates a job with the given chapters and starts it. Returns the job id. */
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

  it('keeps a relation whose ends were created by an earlier chapter of the same job', async () => {
    const jobId = await startedJob([
      { title: '1화', body: '서윤과 지후가 처음 만났다.' },
      { title: '2화', body: '둘은 다시 만났다.' },
    ])
    const scripted: Record<number, Extraction> = {
      1: emptyExtraction({ entries: [entryNamed('서윤'), entryNamed('지후')] }),
      2: emptyExtraction({
        relations: [
          {
            sourceName: '서윤',
            targetName: '지후',
            kind: '친구',
            description: '같은 학교',
            evidence: '둘은 다시 만났다.',
          },
        ],
      }),
    }
    const client = new ScriptedClient((prompt) => scripted[positionOf(prompt)])
    await advanceImportJob(db, jobId, { client })
    await advanceImportJob(db, jobId, { client })

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.filter((r) => r.type === 'relation_create')).toHaveLength(1)
    expect(rows.filter((r) => r.type === 'entry_create')).toHaveLength(2)
  })
})
