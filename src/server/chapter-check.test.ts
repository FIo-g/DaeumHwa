import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import { FAKE_OUTPUTS } from '@/test/ai-fakes'
import { AI_CANCELLED_MESSAGE, type AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import {
  aiRuns,
  issues,
  namingRules,
  proposals,
  relations,
  threadEvents,
  threads,
} from '@/db/schema'
import type { Actor, IssueRow, ProposalRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { CHAPTER_EXTRACT_SYSTEM } from '@/ai/tasks/chapter-extract'
import { MAX_PROOFREAD_AI_CHARS, runChapterCheck, runProofread } from '@/server/chapter-check'
import { approveProposal } from '@/server/proposals'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestThread,
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

function actor(userId: string): Actor {
  return { userId }
}

async function expectAppError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
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

describe('runChapterCheck', () => {
  it('a failed call stops its sibling and both runs end with a stored status', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '서윤은 검을 쥐었다.',
    })
    const client: AiClient = {
      provider: 'fake',
      defaultModel: 'fake',
      async generateObject(args) {
        if (args.task.name === 'continuity-check') {
          throw new AppError('AI_ERROR', 'AI 응답 형식이 올바르지 않습니다.')
        }
        // The sibling call waits until the chapter check aborts it, as a real client would.
        return new Promise((_resolve, reject) => {
          args.signal?.addEventListener('abort', () =>
            reject(new AppError('CANCELLED', AI_CANCELLED_MESSAGE)),
          )
        })
      },
      streamText() {
        throw new Error('not used')
      },
    }

    const error = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      client,
    ).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'AI_ERROR', message: 'AI 응답 형식이 올바르지 않습니다.' })

    const runs = await db.select().from(aiRuns).where(eq(aiRuns.chapterId, chapter.id))
    expect(runs).toHaveLength(2)
    expect(runs.map((run) => run.status)).toEqual(['error', 'error'])
  })

  it('flags a contradiction against a wiki fact with the fact id and the manuscript sentence', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '서윤은 오른손으로 검을 쥐었다.',
    })
    const entry = await createTestEntry(db, workId, { name: '서윤' })
    const fact = await createTestFact(db, workId, {
      content: '서윤은 왼손잡이다.',
      entryId: entry.id,
    })

    const result = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      new FakeAiClient(),
    )

    const contradictions = result.issues.filter((i: IssueRow) => i.kind === 'contradiction')
    expect(contradictions).toHaveLength(1)
    expect(contradictions[0]).toMatchObject({
      status: 'open',
      factId: fact.id,
      quote: '서윤은 오른손으로 검을 쥐었다.',
      quoteStart: 0,
      quoteEnd: '서윤은 오른손으로 검을 쥐었다.'.length,
    })
    expect(result.runIds).toHaveLength(2)
  })

  it('flags a naming rule variant as a naming issue with a suggestion', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '레이야가 웃었다.' })
    await db.insert(namingRules).values({ workId, canonical: '레이아', variants: ['레이야'] })

    const result = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      new FakeAiClient(),
    )

    expect(result.namingIssueCount).toBe(1)
    const naming = result.issues.find((i: IssueRow) => i.kind === 'naming')
    expect(naming).toMatchObject({
      severity: 'low',
      wikiExcerpt: '표기 규칙: 레이아',
      quote: '레이야가 웃었다.',
      suggestion: '레이아가 웃었다.',
    })
  })

  it('keeps a correct name that contains a variant, and flags the bare variant once with a suggestion', async () => {
    await db.insert(namingRules).values({ workId, canonical: '카일론', variants: ['카일'] })

    const correct = await createTestChapter(db, workId, { position: 1, body: '카일론이 웃었다.' })
    const correctResult = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: correct.id },
      new FakeAiClient(),
    )
    expect(correctResult.namingIssueCount).toBe(0)
    expect(correctResult.issues.filter((i: IssueRow) => i.kind === 'naming')).toEqual([])
    const correctRows = await db
      .select()
      .from(issues)
      .where(and(eq(issues.chapterId, correct.id), eq(issues.kind, 'naming')))
    expect(correctRows).toEqual([])

    const bare = await createTestChapter(db, workId, { position: 2, body: '카일이 웃었다.' })
    const bareResult = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: bare.id },
      new FakeAiClient(),
    )
    expect(bareResult.namingIssueCount).toBe(1)
    const naming = bareResult.issues.filter((i: IssueRow) => i.kind === 'naming')
    expect(naming).toHaveLength(1)
    expect(naming[0]).toMatchObject({
      quote: '카일이 웃었다.',
      suggestion: '카일론이 웃었다.',
    })
  })

  it('re-running replaces open issues but keeps a dismissed one', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '서윤은 오른손으로 검을 쥐었다.',
    })
    const entry = await createTestEntry(db, workId, { name: '서윤' })
    await createTestFact(db, workId, { content: '서윤은 왼손잡이다.', entryId: entry.id })

    const first = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      new FakeAiClient(),
    )
    const firstIssue = first.issues[0]
    await db.update(issues).set({ status: 'dismissed' }).where(eq(issues.id, firstIssue.id))

    const second = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      new FakeAiClient(),
    )

    const all = await db.select().from(issues).where(eq(issues.chapterId, chapter.id))
    const dismissed = all.filter((i) => i.status === 'dismissed')
    const open = all.filter((i) => i.status === 'open')
    expect(dismissed.map((i) => i.id)).toEqual([firstIssue.id])
    expect(open).toHaveLength(second.issues.length)
    expect(open.map((i) => i.id)).not.toContain(firstIssue.id)
  })

  it('replaces pending post_chapter proposals on re-run instead of stacking them', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '서윤은 검을 쥐었다.',
    })
    await createTestEntry(db, workId, { name: '서윤' })

    const listPending = () =>
      db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.workId, workId),
            eq(proposals.source, 'post_chapter'),
            eq(proposals.status, 'pending'),
          ),
        )

    await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, new FakeAiClient())
    const firstRows: ProposalRow[] = await listPending()
    expect(firstRows.length).toBeGreaterThan(0)

    await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, new FakeAiClient())
    const secondRows: ProposalRow[] = await listPending()
    expect(secondRows).toHaveLength(firstRows.length)
    const firstIds = new Set(firstRows.map((r) => r.id))
    expect(secondRows.some((r) => firstIds.has(r.id))).toBe(false)
  })

  it('does not flag a fact whose validity ended before this chapter', async () => {
    await createTestChapter(db, workId, { position: 1, body: '서윤은 가나다.' })
    const chapter2 = await createTestChapter(db, workId, {
      position: 2,
      body: '서윤은 오른손으로 검을 쥐었다.',
    })
    const entry = await createTestEntry(db, workId, { name: '서윤' })
    await createTestFact(db, workId, {
      content: '서윤은 왼손잡이다.',
      entryId: entry.id,
      validToPosition: 1,
    })

    const result = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter2.id },
      new FakeAiClient(),
    )
    expect(result.issues.filter((i: IssueRow) => i.kind === 'contradiction')).toEqual([])
  })

  it('runChapterCheck sends a compound-only place card to the continuity prompt', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 3,
      body: '종루지기가 문 앞에 섰다.',
    })
    const place = await createTestEntry(db, workId, {
      name: '잿빛 종루',
      kind: 'place',
      aliases: ['종루'],
    })
    await createTestFact(db, workId, { entryId: place.id, content: '잿빛 종루는 9층 높이다.' })

    const prompts: string[] = []
    const scripted = scriptedClient(() => undefined)
    const recordingClient: AiClient = {
      provider: 'fake',
      defaultModel: 'fake',
      async generateObject(args) {
        if (args.task.name === 'continuity-check') prompts.push(args.prompt)
        return scripted.generateObject(args)
      },
      streamText() {
        throw new Error('not used')
      },
    }

    await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, recordingClient)

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('[E1] 잿빛 종루 (장소)')
    const wiki = prompts[0].slice(prompts[0].indexOf('<wiki>'), prompts[0].indexOf('</wiki>'))
    expect(wiki).toContain('잿빛 종루는 9층 높이다.')
  })

  it('drops an AI issue that has neither a wiki fact nor an entry', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '서윤은 오른손으로 검을 쥐었다.',
    })
    const result = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      scriptedClient((system) =>
        system.startsWith('당신은 장기 연재 웹소설의 설정 오류')
          ? {
              issues: [
                {
                  quote: '서윤은 오른손으로 검을 쥐었다.',
                  kind: 'contradiction',
                  severity: 'high',
                  factRef: null,
                  entryRef: null,
                  wikiExcerpt: '',
                  explanation: '근거 없음',
                  suggestion: '',
                },
              ],
            }
          : undefined,
      ),
    )
    expect(result.issues).toEqual([])
  })

  it('a viewer gets FORBIDDEN and a non-member gets NOT_FOUND', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '서윤은 검을 쥐었다.',
    })
    const viewer = await createTestUser(db)
    await addTestMember(db, workId, viewer.id, 'viewer')
    await expectAppError(
      runChapterCheck(db, actor(viewer.id), { chapterId: chapter.id }, new FakeAiClient()),
      'FORBIDDEN',
    )
    const stranger = await createTestUser(db)
    await expectAppError(
      runChapterCheck(db, actor(stranger.id), { chapterId: chapter.id }, new FakeAiClient()),
      'NOT_FOUND',
    )
  })
})

describe('runProofread', () => {
  it('returns the rule suggestion for 되요 with offsets when AI is off', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: '안 되요.', useAi: false },
      new FakeAiClient(),
    )
    expect(result.runId).toBeNull()
    expect(result.suggestions).toEqual([
      {
        source: 'rule',
        quote: '되요',
        replacement: '돼요',
        kind: 'spelling',
        reason: "'되어요'의 준말은 '돼요'입니다.",
        start: 2,
        end: 4,
      },
    ])
  })

  it('drops AI suggestions that collide with a rule suggestion and keeps the rest sorted', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = '안 되요. 그건 좀 어색해요.'
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      scriptedClient((system) =>
        system.startsWith('당신은 한국어 웹소설 교정자다.')
          ? {
              suggestions: [
                { quote: '되요', replacement: '돼요', kind: 'spelling', reason: '중복' },
                {
                  quote: '어색해요',
                  replacement: '어색합니다',
                  kind: 'awkward',
                  reason: '더 자연스럽게',
                },
              ],
            }
          : undefined,
      ),
    )
    expect(result.runId).not.toBeNull()
    expect(result.suggestions.map((s) => [s.source, s.quote, s.start])).toEqual([
      ['rule', '되요', 2],
      ['ai', '어색해요', text.indexOf('어색해요')],
    ])
  })

  it('a viewer gets FORBIDDEN', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const viewer = await createTestUser(db)
    await addTestMember(db, workId, viewer.id, 'viewer')
    await expectAppError(
      runProofread(db, actor(viewer.id), { chapterId: chapter.id, text: '되요', useAi: false }),
      'FORBIDDEN',
    )
  })
})

/** A chapter extraction as the model would return it, with the given threads and relations. */
function extractionOutput(over: {
  threads?: Record<string, unknown>[]
  relations?: Record<string, unknown>[]
}) {
  return {
    summary: null,
    entries: [],
    facts: [],
    threads: over.threads ?? [],
    relations: over.relations ?? [],
  }
}

describe('runChapterCheck: repeated extraction', () => {
  it('a chapter that plants a planned thread records one planting, and a rerun proposes nothing new', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '칼집 안에서 검의 비밀이 드러났다.',
    })
    const thread = await createTestThread(db, workId, { title: '검의 비밀', status: 'planned' })
    const client = scriptedClient((system) =>
      system === CHAPTER_EXTRACT_SYSTEM
        ? extractionOutput({
            threads: [
              {
                title: '검의 비밀',
                description: '칼집 안의 글귀',
                kind: 'planted',
                evidence: '칼집 안에서 검의 비밀이 드러났다.',
                existingThreadRef: 'T1',
                targetChapterPosition: null,
              },
            ],
          })
        : undefined,
    )

    const first = await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, client)
    const planting = first.proposals.filter((p) => p.type !== 'thread_create')
    expect(first.proposals.filter((p) => p.type === 'thread_create')).toHaveLength(0)
    expect(planting.map((p) => p.type)).toEqual(['thread_event'])
    await approveProposal(db, actor(owner.id), { proposalId: first.proposals[0].id })

    const [updated] = await db.select().from(threads).where(eq(threads.id, thread.id))
    expect(updated.status).toBe('planted')
    expect(updated.plantedChapterId).toBe(chapter.id)
    const events = await db.select().from(threadEvents).where(eq(threadEvents.threadId, thread.id))
    expect(events.map((e) => e.kind)).toEqual(['planted'])
    expect(await db.select().from(threads).where(eq(threads.workId, workId))).toHaveLength(1)

    const second = await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, client)
    expect(
      second.proposals.filter((p) => p.type === 'thread_create' || p.type === 'thread_event'),
    ).toHaveLength(0)
  })

  it('a relation the wiki already has is not proposed again, in either direction', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 1,
      body: '서윤과 민준은 연인이 되었다.',
    })
    await createTestEntry(db, workId, { name: '서윤' })
    await createTestEntry(db, workId, { name: '민준' })
    const relation = (sourceName: string, targetName: string) => ({
      sourceName,
      targetName,
      kind: '연인',
      description: '',
      evidence: '서윤과 민준은 연인이 되었다.',
    })
    const client = (rel: ReturnType<typeof relation>) =>
      scriptedClient((system) =>
        system === CHAPTER_EXTRACT_SYSTEM ? extractionOutput({ relations: [rel] }) : undefined,
      )

    const first = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      client(relation('서윤', '민준')),
    )
    expect(first.proposals.map((p) => p.type)).toEqual(['relation_create'])
    await approveProposal(db, actor(owner.id), { proposalId: first.proposals[0].id })

    const again = await runChapterCheck(
      db,
      actor(owner.id),
      { chapterId: chapter.id },
      client(relation('민준', '서윤')),
    )
    expect(again.proposals.filter((p) => p.type === 'relation_create')).toHaveLength(0)
    expect(await db.select().from(relations).where(eq(relations.workId, workId))).toHaveLength(1)
  })
})

describe('runProofread: input length', () => {
  it('rejects AI proofreading of text over the limit before any model call', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    let calls = 0
    const client = scriptedClient(() => {
      calls += 1
      return undefined
    })

    await expectAppError(
      runProofread(
        db,
        actor(owner.id),
        {
          chapterId: chapter.id,
          text: '가'.repeat(MAX_PROOFREAD_AI_CHARS + 1),
          useAi: true,
        },
        client,
      ),
      'VALIDATION',
    )
    expect(calls).toBe(0)
  })

  it('accepts AI proofreading at exactly the limit', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: '가'.repeat(MAX_PROOFREAD_AI_CHARS), useAi: true },
      new FakeAiClient(),
    )
    expect(result.runId).not.toBeNull()
  })
})

describe('runChapterCheck: speech is interview-only', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('never proposes a speech update from a chapter, even with the speech feature on', async () => {
    vi.stubEnv('AI_SPEECH_STYLE', 'on')
    const chapter = await createTestChapter(db, workId, {
      position: 2,
      body: '서윤은 문을 열었다.',
    })
    await createTestEntry(db, workId, { name: '서윤', kind: 'character' })
    const extraction = {
      summary: null,
      entries: [
        {
          name: '서윤',
          kind: 'character' as const,
          aliases: [],
          summary: '',
          fields: [{ key: 'speech', value: '존댓말' }],
        },
      ],
      facts: [],
      threads: [],
      relations: [],
    }
    const client = scriptedClient((system) =>
      system === CHAPTER_EXTRACT_SYSTEM ? extraction : undefined,
    )

    await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, client)

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    const speechUpdates = rows.filter(
      (row) => row.type === 'entry_update' && JSON.stringify(row.payload).includes('"speech"'),
    )
    expect(speechUpdates).toEqual([])
  })
})
