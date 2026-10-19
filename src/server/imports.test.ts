import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Extraction } from '@/ai/extraction'
import { FakeAiClient } from '@/test/fake-ai'
import type { GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { aiRuns, chapters, importJobs, proposals, relations } from '@/db/schema'
import type { Actor, ImportJobRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestEntry,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'

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
  cancelImportJob,
  createImportJob,
  getImportJob,
  listImportJobs,
  pauseImportJob,
  skipImportChapter,
  startImportJob,
} from '@/server/imports'

/** Returns scripted extraction output and records every prompt. Throws when `respond` throws. */
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

function emptyExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return { summary: null, entries: [], facts: [], threads: [], relations: [], ...overrides }
}

/** Holds every AI call until `open` is called, so a second advance can start while the first is in flight. */
class GatedClient extends ScriptedClient {
  calls = 0
  private release: () => void = () => {}
  private readonly gate: Promise<void>

  constructor(respond: (prompt: string) => unknown) {
    super(respond)
    this.gate = new Promise<void>((resolve) => {
      this.release = resolve
    })
  }

  override async generateObject<T>(args: GenerateObjectArgs<T>) {
    this.calls += 1
    await this.gate
    return super.generateObject(args)
  }

  open(): void {
    this.release()
  }
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  expect(condition()).toBe(true)
}

function positionOf(prompt: string): number {
  const match = /<manuscript position="(\d+)"/.exec(prompt)
  if (!match) throw new Error('no manuscript position in prompt')
  return Number(match[1])
}

function entryNamed(name: string): Extraction['entries'][number] {
  return { name, kind: 'character', aliases: [], summary: '', fields: [] }
}

const SEOYUN_ENTRY = {
  name: '서윤',
  kind: 'character' as const,
  aliases: [],
  summary: '주인공',
  fields: [],
}

/** Chapter 1 introduces 서윤, every chapter adds one fact and a summary. */
function basicRespond(prompt: string): Extraction {
  const position = positionOf(prompt)
  return emptyExtraction({
    summary: `${position}화 요약`,
    entries: position === 1 || position === 2 ? [SEOYUN_ENTRY] : [],
    facts: [
      {
        subjectName: '서윤',
        content: `${position}화에서 서윤의 설정이 드러난다.`,
        evidence: '서윤은 말이 없었다.',
        suggestedStatus: 'confirmed',
        supersedesFactRef: null,
      },
    ],
  })
}

const CHAPTERS = [
  { title: '1화', body: '서윤은 말이 없었다. 그녀는 창가에 앉아 있었다.' },
  { title: '2화', body: '서윤이 문을 열었다. 바람이 들어왔다.' },
  { title: '3화', body: '서윤은 편지를 읽었다. 그리고 웃었다.' },
]

describe('import jobs', () => {
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

  /** Creates a job, uploads all CHAPTERS and returns the job id. */
  async function uploadedJob(): Promise<string> {
    const job = await createImportJob(db, actor, {
      workId,
      fileName: 'novel.txt',
      totalChapters: CHAPTERS.length,
    })
    await appendImportChapters(db, actor, { jobId: job.id, chapters: CHAPTERS })
    return job.id
  }

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

  /** Marks the AI runs of the owner as running, as if other AI tasks were in flight. */
  async function occupyAiSlots(count: number): Promise<void> {
    await db.insert(aiRuns).values(
      Array.from({ length: count }, () => ({
        workId,
        userId: owner.id,
        task: 'chapter-extract' as const,
        status: 'running' as const,
        model: 'fake',
      })),
    )
  }

  async function expectAppError(promise: Promise<unknown>, code: string, message?: string) {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe(code)
    if (message !== undefined) expect((error as AppError).message).toBe(message)
  }

  describe('createImportJob', () => {
    it('creates an uploading job for an editor', async () => {
      const job = await createImportJob(db, actor, {
        workId,
        fileName: 'novel.txt',
        totalChapters: 3,
      })
      expect(job.status).toBe('uploading')
      expect(job.totalChapters).toBe(3)
      expect(job.chapterIds).toEqual([])
      expect(job.cursor).toBe(0)
      expect(job.runner).toBe('client')
      expect(job.createdBy).toBe(owner.id)
    })

    it('rejects a chapter count outside 1 to 2000', async () => {
      await expectAppError(
        createImportJob(db, actor, { workId, fileName: 'a.txt', totalChapters: 0 }),
        'VALIDATION',
        '회차 수가 올바르지 않습니다.',
      )
      await expectAppError(
        createImportJob(db, actor, { workId, fileName: 'a.txt', totalChapters: 2001 }),
        'VALIDATION',
        '회차 수가 올바르지 않습니다.',
      )
    })

    it('forbids a viewer and hides the work from a non-member', async () => {
      const viewer = await createTestUser(db)
      await addTestMember(db, workId, viewer.id, 'viewer')
      await expectAppError(
        createImportJob(db, { userId: viewer.id }, { workId, fileName: 'a.txt', totalChapters: 1 }),
        'FORBIDDEN',
      )
      const stranger = await createTestUser(db)
      await expectAppError(
        createImportJob(
          db,
          { userId: stranger.id },
          { workId, fileName: 'a.txt', totalChapters: 1 },
        ),
        'NOT_FOUND',
      )
    })
  })

  describe('appendImportChapters', () => {
    it('appends chapters as done with import version rows and records their ids', async () => {
      const job = await createImportJob(db, actor, {
        workId,
        fileName: 'novel.txt',
        totalChapters: 3,
      })
      const result = await appendImportChapters(db, actor, {
        jobId: job.id,
        chapters: CHAPTERS,
      })
      expect(result).toEqual({ appended: 3, received: 3 })

      const job2 = await getImportJob(db, actor, job.id)
      expect(job2.chapterIds).toHaveLength(3)
      const rows = await db.select().from(chapters).where(eq(chapters.workId, workId))
      const sorted = rows.sort((a, b) => a.position - b.position)
      expect(sorted.map((c) => c.position)).toEqual([1, 2, 3])
      expect(sorted.map((c) => c.status)).toEqual(['done', 'done', 'done'])
      expect(sorted.map((c) => c.title)).toEqual(['', '', ''])
      expect(job2.chapterIds).toEqual(sorted.map((c) => c.id))
    })

    it('rejects more than 50 chapters in one call', async () => {
      const job = await createImportJob(db, actor, {
        workId,
        fileName: 'novel.txt',
        totalChapters: 100,
      })
      const many = Array.from({ length: 51 }, (_, i) => ({ title: `${i + 1}화`, body: '본문' }))
      await expectAppError(
        appendImportChapters(db, actor, { jobId: job.id, chapters: many }),
        'VALIDATION',
        '한 번에 50화까지 올릴 수 있습니다.',
      )
    })

    it('rejects chapters beyond the declared total', async () => {
      const job = await createImportJob(db, actor, {
        workId,
        fileName: 'novel.txt',
        totalChapters: 2,
      })
      await expectAppError(
        appendImportChapters(db, actor, { jobId: job.id, chapters: CHAPTERS }),
        'VALIDATION',
        '올린 회차가 전체 회차 수를 넘습니다.',
      )
    })

    it('rejects uploads once the job has started', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      await expectAppError(
        appendImportChapters(db, actor, { jobId, chapters: [{ title: '4화', body: '본문' }] }),
        'BAD_STATE',
      )
    })
  })

  describe('appendImportChapters publishedOn', () => {
    it('marks the imported chapters as published on the given day', async () => {
      const job = await createImportJob(db, actor, { workId, fileName: 'a.txt', totalChapters: 3 })
      await appendImportChapters(db, actor, {
        jobId: job.id,
        chapters: CHAPTERS,
        publishedOn: '2026-10-16',
      })
      const rows = await db.select().from(chapters).where(eq(chapters.workId, workId))
      expect(rows.map((c) => c.publishedOn)).toEqual(['2026-10-16', '2026-10-16', '2026-10-16'])
      expect(rows.map((c) => c.status)).toEqual(['done', 'done', 'done'])
    })

    it('leaves publishedOn empty when the option is not given', async () => {
      await uploadedJob()
      const rows = await db.select().from(chapters).where(eq(chapters.workId, workId))
      expect(rows.every((c) => c.publishedOn === null)).toBe(true)
    })

    it('rejects a publishedOn that is not a date', async () => {
      const job = await createImportJob(db, actor, { workId, fileName: 'a.txt', totalChapters: 3 })
      await expectAppError(
        appendImportChapters(db, actor, {
          jobId: job.id,
          chapters: CHAPTERS,
          publishedOn: '2026-13-40',
        }),
        'VALIDATION',
        '연재일 형식이 올바르지 않습니다.',
      )
    })
  })

  describe('startImportJob', () => {
    it('refuses to start before every chapter is uploaded', async () => {
      const job = await createImportJob(db, actor, {
        workId,
        fileName: 'novel.txt',
        totalChapters: 3,
      })
      await appendImportChapters(db, actor, { jobId: job.id, chapters: CHAPTERS.slice(0, 2) })
      await expectAppError(startImportJob(db, actor, job.id), 'BAD_STATE')
    })

    it('starts a fully uploaded job with the client runner when Inngest is off', async () => {
      const jobId = await uploadedJob()
      const started = await startImportJob(db, actor, jobId)
      expect(started.status).toBe('running')
      expect(started.runner).toBe('client')
      expect(started.startedAt).not.toBeNull()
      expect(mocks.send).not.toHaveBeenCalled()
    })

    it('sends an import/run event and uses the inngest runner when Inngest is on', async () => {
      mocks.enabled = true
      const jobId = await uploadedJob()
      const started = await startImportJob(db, actor, jobId)
      expect(started.runner).toBe('inngest')
      expect(mocks.send).toHaveBeenCalledWith({ name: 'import/run', data: { jobId } })
    })
  })

  describe('advanceImportJob', () => {
    it('processes every chapter once and writes import proposals', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const client = new ScriptedClient(basicRespond)

      const first = await advanceImportJob(db, jobId, { client })
      expect(first).toEqual({
        status: 'running',
        processed: 1,
        total: 3,
        done: false,
        message: null,
      })
      await advanceImportJob(db, jobId, { client })
      const last = await advanceImportJob(db, jobId, { client })
      expect(last).toEqual({ status: 'done', processed: 3, total: 3, done: true, message: null })

      const job = await getImportJob(db, actor, jobId)
      expect(job.status).toBe('done')
      expect(job.processedChapters).toBe(3)
      expect(job.cursor).toBe(3)
      expect(job.finishedAt).not.toBeNull()

      expect(client.prompts.map(positionOf)).toEqual([1, 2, 3])
      expect(client.prompts[0]).toContain('서윤은 말이 없었다.')

      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      expect(rows.every((r) => r.source === 'import' && r.sourceRef === jobId)).toBe(true)
      const byType = (type: string) => rows.filter((r) => r.type === type).length
      // The entry is proposed once even though chapter 2 names it again.
      expect(byType('entry_create')).toBe(1)
      expect(byType('fact_create')).toBe(3)
      expect(byType('chapter_summary')).toBe(3)
      expect(job.proposalCount).toBe(rows.length)
    })

    it('leaves a job that is not running untouched', async () => {
      const jobId = await uploadedJob()
      const client = new ScriptedClient(basicRespond)
      const result = await advanceImportJob(db, jobId, { client })
      expect(result.status).toBe('uploading')
      expect(result.processed).toBe(0)
      expect(client.prompts).toHaveLength(0)
    })

    it('calls the AI at most once per chapter when two calls run at the same time', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const client = new ScriptedClient(basicRespond)

      await Promise.all([
        advanceImportJob(db, jobId, { client }),
        advanceImportJob(db, jobId, { client }),
      ])

      // Every AI call is for a different chapter, and the cursor counts exactly those calls.
      const positions = client.prompts.map(positionOf)
      expect(new Set(positions).size).toBe(positions.length)
      const job = await getImportJob(db, actor, jobId)
      expect(job.cursor).toBe(positions.length)
      expect(job.processedChapters).toBe(positions.length)
      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      expect(job.proposalCount).toBe(rows.length)
    })

    it('does not call the AI again while another call holds the chapter', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const client = new GatedClient(basicRespond)

      const first = advanceImportJob(db, jobId, { client })
      await waitUntil(() => client.calls === 1)
      const second = await advanceImportJob(db, jobId, { client })
      expect(second).toEqual({
        status: 'running',
        processed: 0,
        total: 3,
        done: false,
        message: null,
      })
      expect(client.calls).toBe(1)

      client.open()
      expect(await first).toMatchObject({ status: 'running', processed: 1 })
      expect(client.calls).toBe(1)
      const job = await getImportJob(db, actor, jobId)
      expect(job.state).not.toHaveProperty('inFlight')
    })

    it('takes over a chapter claim that is older than ten minutes', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const old = new Date(Date.now() - 11 * 60 * 1000).toISOString()
      await db
        .update(importJobs)
        .set({
          state: {
            knownEntities: [],
            threadTitles: [],
            inFlight: { cursor: 0, at: old },
          } as ImportJobRow['state'],
        })
        .where(eq(importJobs.id, jobId))

      const client = new ScriptedClient(basicRespond)
      const result = await advanceImportJob(db, jobId, { client })
      expect(result.processed).toBe(1)
      expect(client.prompts).toHaveLength(1)
    })

    it('releases the chapter claim when the AI call fails', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const failing = new ScriptedClient(() => {
        throw new AppError('AI_ERROR', 'AI 호출에 실패했습니다: timeout')
      })
      await advanceImportJob(db, jobId, { client: failing })
      const failed = await getImportJob(db, actor, jobId)
      expect(failed.state).not.toHaveProperty('inFlight')

      await startImportJob(db, actor, jobId)
      const retried = await advanceImportJob(db, jobId, {
        client: new ScriptedClient(basicRespond),
      })
      expect(retried.processed).toBe(1)
    })

    it('keeps the job running and skips the AI call when the author has too many AI runs', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      await occupyAiSlots(3)
      const client = new ScriptedClient(basicRespond)

      const busy = await advanceImportJob(db, jobId, { client })
      expect(busy).toEqual({
        status: 'running',
        processed: 0,
        total: 3,
        done: false,
        message: '다른 AI 작업이 끝나면 이어서 진행합니다.',
      })
      expect(client.prompts).toHaveLength(0)
      const job = await getImportJob(db, actor, jobId)
      expect(job.status).toBe('running')
      expect(job.error).toBeNull()
      expect(job.cursor).toBe(0)
      expect(job.state).not.toHaveProperty('inFlight')

      await db.update(aiRuns).set({ status: 'done' }).where(eq(aiRuns.userId, owner.id))
      const next = await advanceImportJob(db, jobId, { client })
      expect(next.processed).toBe(1)
      expect(client.prompts.map(positionOf)).toEqual([1])
    })

    it('keeps names that differ by one syllable as separate entries', async () => {
      const jobId = await startedJob([
        { title: '1화', body: '김서아가 왔다.' },
        { title: '2화', body: '김서은이 왔다.' },
        { title: '3화', body: '김서아가 웃었다.' },
      ])
      const scripted: Record<number, Extraction> = {
        1: emptyExtraction({ entries: [entryNamed('김서아')] }),
        2: emptyExtraction({ entries: [entryNamed('김서은')] }),
        3: emptyExtraction({ entries: [entryNamed('김서아가')] }),
      }
      const client = new ScriptedClient((prompt) => scripted[positionOf(prompt)])
      for (let i = 0; i < 3; i++) await advanceImportJob(db, jobId, { client })

      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      const created = rows
        .filter((r) => r.type === 'entry_create')
        .map((r) => (r.payload as { name: string }).name)
      expect(created).toEqual(['김서아', '김서은'])
    })

    it('does not propose a fact or relation that repeats one this job already proposed', async () => {
      const jobId = await startedJob([
        { title: '1화', body: '서윤과 지후가 만났다.' },
        { title: '2화', body: '다시 만났다.' },
      ])
      const fact = {
        subjectName: '서윤',
        content: '서윤은 고아다.',
        evidence: '서윤은 말이 없었다.',
        suggestedStatus: 'confirmed' as const,
        supersedesFactRef: null,
      }
      const relation = {
        sourceName: '서윤',
        targetName: '지후',
        kind: '친구',
        description: '같은 학교',
        evidence: '만났다.',
      }
      const first = emptyExtraction({
        entries: [entryNamed('서윤'), entryNamed('지후')],
        facts: [fact],
        relations: [relation],
      })
      // Same fact with extra spacing, and the same pair reversed with the same kind.
      const second = emptyExtraction({
        facts: [{ ...fact, content: '서윤은  고아다.' }],
        relations: [{ ...relation, sourceName: '지후', targetName: '서윤' }],
      })
      const client = new ScriptedClient((prompt) => (positionOf(prompt) === 1 ? first : second))
      await advanceImportJob(db, jobId, { client })
      const result = await advanceImportJob(db, jobId, { client })
      expect(result).toMatchObject({ status: 'done', processed: 2 })

      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      expect(rows.filter((r) => r.type === 'fact_create')).toHaveLength(1)
      expect(rows.filter((r) => r.type === 'relation_create')).toHaveLength(1)
      const job = await getImportJob(db, actor, jobId)
      expect(job.proposalCount).toBe(rows.length)
    })

    it('pauses the job with the Korean message when the daily AI limit is reached', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const limited = new ScriptedClient(() => {
        throw new AppError('AI_LIMIT', '오늘 AI 사용량 한도를 넘었습니다. 내일 다시 시도해 주세요.')
      })

      const result = await advanceImportJob(db, jobId, { client: limited })
      expect(result.status).toBe('paused')
      expect(result.done).toBe(false)
      expect(result.message).toBe(
        '오늘 AI 사용량 한도에 도달해 일시정지했습니다. 내일 이어서 진행하세요.',
      )
      const paused = await getImportJob(db, actor, jobId)
      expect(paused.status).toBe('paused')
      expect(paused.cursor).toBe(0)

      const resumed = await startImportJob(db, actor, jobId)
      expect(resumed.status).toBe('running')
      expect(resumed.error).toBeNull()

      const result2 = await advanceImportJob(db, jobId, {
        client: new ScriptedClient(basicRespond),
      })
      expect(result2.status).toBe('running')
      expect(result2.processed).toBe(1)
    })

    it('resumes a paused job with startImportJob', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      await pauseImportJob(db, actor, jobId)
      const paused = await getImportJob(db, actor, jobId)
      expect(paused.status).toBe('paused')
      const resumed = await startImportJob(db, actor, jobId)
      expect(resumed.status).toBe('running')
    })

    it('marks the job as error with the AI message when the call fails', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const failing = new ScriptedClient(() => {
        throw new AppError('AI_ERROR', 'AI 호출에 실패했습니다: timeout')
      })
      const result = await advanceImportJob(db, jobId, { client: failing })
      expect(result.status).toBe('error')
      expect(result.message).toBe('1화에서 멈췄습니다: AI 호출에 실패했습니다: timeout')
      const job = await getImportJob(db, actor, jobId)
      expect(job.status).toBe('error')
      expect(job.cursor).toBe(0)
    })

    it('ends one planted thread as a single thread_create with the later resolve event', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const planted = {
        title: '잃어버린 편지',
        description: '',
        evidence: '편지',
        targetChapterPosition: null,
      }
      const client = new ScriptedClient((prompt) => {
        const position = positionOf(prompt)
        if (position === 1) {
          return emptyExtraction({
            threads: [{ ...planted, kind: 'planted', existingThreadRef: null }],
          })
        }
        if (position === 3) {
          return emptyExtraction({
            threads: [
              {
                ...planted,
                evidence: '그리고 웃었다.',
                kind: 'resolved',
                existingThreadRef: null,
              },
            ],
          })
        }
        return emptyExtraction()
      })

      await advanceImportJob(db, jobId, { client })
      await advanceImportJob(db, jobId, { client })
      await advanceImportJob(db, jobId, { client })

      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      const creates = rows.filter((r) => r.type === 'thread_create')
      expect(creates).toHaveLength(1)
      expect(rows.filter((r) => r.type === 'thread_event')).toHaveLength(0)
      const payload = creates[0].payload as {
        title: string
        events: { kind: string; chapterId: string; evidence: string }[]
      }
      expect(payload.title).toBe('잃어버린 편지')
      expect(payload.events).toHaveLength(1)
      expect(payload.events[0].kind).toBe('resolved')
      expect(payload.events[0].evidence).toBe('그리고 웃었다.')
      const [chapter3] = await db.select().from(chapters).where(eq(chapters.position, 3))
      expect(payload.events[0].chapterId).toBe(chapter3.id)
    })

    it('uses existing open threads as T refs and attaches a development to them', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const thread = await createTestThread(db, workId, { title: '기존 떡밥', status: 'planted' })
      const client = new ScriptedClient(() =>
        emptyExtraction({
          threads: [
            {
              title: '기존 떡밥',
              description: '',
              kind: 'developed',
              evidence: '서윤은 말이 없었다.',
              existingThreadRef: 'T1',
              targetChapterPosition: null,
            },
          ],
        }),
      )
      await advanceImportJob(db, jobId, { client })
      expect(client.prompts[0]).toContain('[T1] 기존 떡밥')
      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      const events = rows.filter((r) => r.type === 'thread_event')
      expect(events).toHaveLength(1)
      expect((events[0].payload as { threadId: string }).threadId).toBe(thread.id)
    })

    it('does not create a planted thread that the work already has', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const thread = await createTestThread(db, workId, { title: '검의 비밀', status: 'planned' })
      const client = new ScriptedClient(() =>
        emptyExtraction({
          threads: [
            {
              title: '검의 비밀',
              description: '',
              kind: 'planted',
              evidence: '서윤은 말이 없었다.',
              existingThreadRef: null,
              targetChapterPosition: null,
            },
          ],
        }),
      )
      await advanceImportJob(db, jobId, { client })
      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      expect(rows.filter((r) => r.type === 'thread_create')).toHaveLength(0)
      const events = rows.filter((r) => r.type === 'thread_event')
      expect(events).toHaveLength(1)
      expect((events[0].payload as { threadId: string }).threadId).toBe(thread.id)
    })

    it('does not propose a relation that is still open in the work', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const seoyun = await createTestEntry(db, workId, { name: '서윤', kind: 'character' })
      const minjun = await createTestEntry(db, workId, { name: '민준', kind: 'character' })
      await db.insert(relations).values({
        workId,
        sourceEntryId: seoyun.id,
        targetEntryId: minjun.id,
        kind: '동료',
        directed: false,
      })
      const client = new ScriptedClient(() =>
        emptyExtraction({
          relations: [
            {
              sourceName: '민준',
              targetName: '서윤',
              kind: '동료',
              description: '',
              evidence: '서윤은 말이 없었다.',
            },
          ],
        }),
      )
      await advanceImportJob(db, jobId, { client })
      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      expect(rows.filter((r) => r.type === 'relation_create')).toHaveLength(0)
    })

    it('does not propose an entry card that already exists in the work', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      await createTestEntry(db, workId, { name: '서윤' })
      await advanceImportJob(db, jobId, { client: new ScriptedClient(basicRespond) })
      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      expect(rows.filter((r) => r.type === 'entry_create')).toHaveLength(0)
      expect(rows.filter((r) => r.type === 'fact_create')).toHaveLength(1)
    })
  })

  describe('skipImportChapter', () => {
    /** Advances chapter 1 fine and fails chapter 2 with the given message. */
    async function stoppedAtSecond(
      message: string,
    ): Promise<{ jobId: string; client: ScriptedClient }> {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const client = new ScriptedClient((prompt) => {
        if (positionOf(prompt) === 2) throw new AppError('AI_ERROR', message)
        return basicRespond(prompt)
      })
      await advanceImportJob(db, jobId, { client })
      const failed = await advanceImportJob(db, jobId, { client })
      expect(failed.status).toBe('error')
      return { jobId, client }
    }

    it('moves past the chapter that stopped the job and pauses it for a resume', async () => {
      const { jobId, client } = await stoppedAtSecond('AI 호출에 실패했습니다: refusal')
      const skipped = await skipImportChapter(db, actor, jobId)
      expect(skipped).toMatchObject({
        status: 'paused',
        cursor: 2,
        processedChapters: 2,
        error: null,
      })
      expect(skipped.finishedAt).toBeNull()

      const state = skipped.state as { skipped?: { position: number; title: string }[] }
      expect(state.skipped).toEqual([
        {
          chapterId: skipped.chapterIds[1],
          position: 2,
          title: '',
          reason: '2화에서 멈췄습니다: AI 호출에 실패했습니다: refusal',
        },
      ])

      const resumed = await startImportJob(db, actor, jobId)
      expect(resumed.status).toBe('running')
      const last = await advanceImportJob(db, jobId, { client })
      expect(last).toMatchObject({ status: 'done', processed: 3, done: true })

      // The skipped list survives later advances, and the skipped chapter got no proposals.
      const job = await getImportJob(db, actor, jobId)
      const after = job.state as { skipped?: { position: number }[] }
      expect(after.skipped?.map((s) => s.position)).toEqual([2])
      const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
      expect(rows.filter((r) => r.chapterId === skipped.chapterIds[1])).toHaveLength(0)
    })

    it('ends the job as done when the stopped chapter is the last one', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      const client = new ScriptedClient((prompt) => {
        if (positionOf(prompt) === 3)
          throw new AppError('AI_ERROR', 'AI 호출에 실패했습니다: max_tokens')
        return basicRespond(prompt)
      })
      await advanceImportJob(db, jobId, { client })
      await advanceImportJob(db, jobId, { client })
      const failed = await advanceImportJob(db, jobId, { client })
      expect(failed.status).toBe('error')

      const done = await skipImportChapter(db, actor, jobId)
      expect(done).toMatchObject({ status: 'done', processedChapters: 3, cursor: 3, error: null })
      expect(done.finishedAt).not.toBeNull()
    })

    it('refuses a job that is not stopped by an error', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      await expectAppError(
        skipImportChapter(db, actor, jobId),
        'BAD_STATE',
        '오류로 멈춘 작업에서만 이 화를 건너뛸 수 있습니다.',
      )
      await pauseImportJob(db, actor, jobId)
      await expectAppError(skipImportChapter(db, actor, jobId), 'BAD_STATE')
    })

    it('forbids a viewer and hides the work from a non-member', async () => {
      const { jobId } = await stoppedAtSecond('AI 호출에 실패했습니다: refusal')
      const viewer = await createTestUser(db)
      await addTestMember(db, workId, viewer.id, 'viewer')
      await expectAppError(skipImportChapter(db, { userId: viewer.id }, jobId), 'FORBIDDEN')
      const stranger = await createTestUser(db)
      await expectAppError(skipImportChapter(db, { userId: stranger.id }, jobId), 'NOT_FOUND')
    })

    it('skips exactly one chapter when two skips run at the same time', async () => {
      const { jobId } = await stoppedAtSecond('AI 호출에 실패했습니다: refusal')
      const results = await Promise.allSettled([
        skipImportChapter(db, actor, jobId),
        skipImportChapter(db, actor, jobId),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((r) => r.status === 'rejected')
      expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(AppError)

      const job = await getImportJob(db, actor, jobId)
      expect(job.cursor).toBe(2)
      expect((job.state as { skipped?: unknown[] }).skipped).toHaveLength(1)
    })
  })

  describe('pause, cancel and reads', () => {
    it('pauses only a running job', async () => {
      const jobId = await uploadedJob()
      await expectAppError(pauseImportJob(db, actor, jobId), 'BAD_STATE')
      await startImportJob(db, actor, jobId)
      const paused = await pauseImportJob(db, actor, jobId)
      expect(paused.status).toBe('paused')
    })

    it('cancels a job and keeps the chapters and proposals already created', async () => {
      const jobId = await uploadedJob()
      await startImportJob(db, actor, jobId)
      await advanceImportJob(db, jobId, { client: new ScriptedClient(basicRespond) })
      const cancelled = await cancelImportJob(db, actor, jobId)
      expect(cancelled.status).toBe('cancelled')
      expect(cancelled.finishedAt).not.toBeNull()
      const rows = await db.select().from(chapters).where(eq(chapters.workId, workId))
      expect(rows).toHaveLength(3)
      const after = await advanceImportJob(db, jobId, { client: new ScriptedClient(basicRespond) })
      expect(after.status).toBe('cancelled')
      await expectAppError(cancelImportJob(db, actor, jobId), 'BAD_STATE')
    })

    it('lists jobs of a work and hides them from non-members', async () => {
      await uploadedJob()
      const list = await listImportJobs(db, actor, workId)
      expect(list).toHaveLength(1)
      const stranger = await createTestUser(db)
      await expectAppError(listImportJobs(db, { userId: stranger.id }, workId), 'NOT_FOUND')
    })
  })
})
