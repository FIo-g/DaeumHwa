import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { chapters, namingRules, relations, wikiEntries } from '@/db/schema'
import type { Actor } from '@/db/types'
import { AppError } from '@/lib/errors'
import { runChapterCheck } from '@/server/chapter-check'
import { describeCheckContext } from '@/server/check-context'
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

describe('describeCheckContext', () => {
  it('lists the same cards the check sends', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 3,
      body: '서윤은 오른손으로 검을 쥐었다.',
    })
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await createTestEntry(db, workId, { name: '한세린' })
    await createTestFact(db, workId, {
      entryId: seoyun.id,
      content: '서윤은 왼손잡이다.',
      status: 'confirmed',
    })

    const view = await describeCheckContext(db, actor(owner.id), { chapterId: chapter.id })
    expect(view.entries).toHaveLength(1)
    expect(view.entries[0]).toMatchObject({ id: seoyun.id, name: '서윤', kind: 'character' })
    expect(view.entries[0].facts).toHaveLength(1)
    expect(view.entries[0].facts[0]).toMatchObject({
      content: '서윤은 왼손잡이다.',
      status: 'confirmed',
    })

    const fake = new FakeAiClient()
    await runChapterCheck(db, actor(owner.id), { chapterId: chapter.id }, fake)
    const prompt = fake.recorded.find((call) => call.name === 'continuity-check')?.prompt ?? ''
    const wiki = prompt.slice(prompt.indexOf('<wiki>'), prompt.indexOf('</wiki>'))
    expect(wiki).toContain('서윤')
    expect(prompt).not.toContain('한세린')
  })

  it('shows only facts valid at the chapter', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 3,
      body: '서윤은 검을 쥐었다.',
    })
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await createTestFact(db, workId, {
      entryId: seoyun.id,
      content: '앞으로 나올 사실',
      validFromPosition: 5,
    })
    await createTestFact(db, workId, {
      entryId: seoyun.id,
      content: '지난 사실',
      validToPosition: 2,
    })
    await createTestFact(db, workId, {
      entryId: seoyun.id,
      content: '언제나 유효한 사실',
    })

    const view = await describeCheckContext(db, actor(owner.id), { chapterId: chapter.id })
    expect(view.entries).toHaveLength(1)
    expect(view.entries[0].facts).toHaveLength(1)
    expect(view.entries[0].facts[0]).toMatchObject({
      content: '언제나 유효한 사실',
      validFromPosition: null,
      validToPosition: null,
    })
  })

  it('names the cards the budget cut', async () => {
    // Named cards are never dropped by trimKeepingNamed, so the cut cards here are the
    // always-tier cards the manuscript does not name (dropped before facts and summaries).
    const chapter = await createTestChapter(db, workId, {
      position: 3,
      body: '서윤과 지후와 민아가 마주 앉았다.',
    })
    for (const name of ['서윤', '지후', '민아']) {
      const entry = await createTestEntry(db, workId, { name, summary: '요'.repeat(7_000) })
      await createTestFact(db, workId, { entryId: entry.id, content: '사실'.repeat(500) })
    }
    const alwaysNames = ['한세린', '박도현']
    for (const name of alwaysNames) {
      const entry = await createTestEntry(db, workId, { name, summary: '늘 보내는 카드' })
      await db
        .update(wikiEntries)
        .set({ contextTier: 'always' })
        .where(eq(wikiEntries.id, entry.id))
    }

    const view = await describeCheckContext(db, actor(owner.id), { chapterId: chapter.id })
    expect([...view.trimmedEntryNames].sort()).toEqual([...alwaysNames].sort())
    expect(view.entries.map((entry) => entry.name).sort()).toEqual(['민아', '서윤', '지후'])
  })

  it('lists open threads, previous summaries and counts', async () => {
    const chapter1 = await createTestChapter(db, workId, { position: 1, title: '첫 회차' })
    const chapter2 = await createTestChapter(db, workId, { position: 2, title: '둘째 회차' })
    await db.update(chapters).set({ summary: '첫 요약' }).where(eq(chapters.id, chapter1.id))
    await db.update(chapters).set({ summary: '둘째 요약' }).where(eq(chapters.id, chapter2.id))
    const chapter3 = await createTestChapter(db, workId, {
      position: 3,
      body: '서윤과 지후가 마주 앉았다.',
    })
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    const jihu = await createTestEntry(db, workId, { name: '지후' })

    await createTestThread(db, workId, {
      title: '어머니의 편지',
      status: 'planted',
      plantedChapterId: chapter1.id,
      targetChapterPosition: 2,
    })
    await createTestThread(db, workId, { title: '끝난 떡밥', status: 'resolved' })
    await db.insert(relations).values({
      workId,
      sourceEntryId: seoyun.id,
      targetEntryId: jihu.id,
      kind: '동료',
    })
    await db.insert(namingRules).values({
      workId,
      canonical: '서윤',
      variants: ['서연'],
    })

    const view = await describeCheckContext(db, actor(owner.id), { chapterId: chapter3.id })
    expect(view.threads).toHaveLength(1)
    expect(view.threads[0]).toMatchObject({
      title: '어머니의 편지',
      status: 'planted',
      targetPosition: 2,
      overdue: true,
    })
    expect(view.previousSummaries).toEqual([
      { position: 1, title: '첫 회차' },
      { position: 2, title: '둘째 회차' },
    ])
    expect(view.relationCount).toBe(1)
    expect(view.namingRuleCount).toBe(1)
    expect(view.totalEntries).toBe(2)
  })

  it('lets a viewer read it and hides it from outsiders', async () => {
    const chapter = await createTestChapter(db, workId, {
      position: 3,
      body: '서윤은 검을 쥐었다.',
    })
    await createTestEntry(db, workId, { name: '서윤' })
    const viewer = await createTestUser(db)
    await addTestMember(db, workId, viewer.id, 'viewer')

    const view = await describeCheckContext(db, actor(viewer.id), { chapterId: chapter.id })
    expect(view.entries.map((entry) => entry.name)).toEqual(['서윤'])

    const outsider = await createTestUser(db)
    await expectAppError(
      describeCheckContext(db, actor(outsider.id), { chapterId: chapter.id }),
      'NOT_FOUND',
    )

    const archived = await createTestChapter(db, workId, { position: 4, body: '보관한 회차' })
    await db.update(chapters).set({ archivedAt: new Date() }).where(eq(chapters.id, archived.id))
    await expectAppError(
      describeCheckContext(db, actor(owner.id), { chapterId: archived.id }),
      'NOT_FOUND',
    )

    const missing = '00000000-0000-4000-8000-000000000000'
    const err = await describeCheckContext(db, actor(owner.id), { chapterId: missing }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('NOT_FOUND')
    expect((err as AppError).message).toBe('회차를 찾을 수 없습니다.')
  })
})
