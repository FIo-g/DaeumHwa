import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/ai/fake'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import { issues, namingRules, proposals } from '@/db/schema'
import type { Actor, IssueRow, ProposalRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { runChapterCheck, runProofread } from '@/server/chapter-check'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
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
      const raw = scripted === undefined ? args.fake() : scripted
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
