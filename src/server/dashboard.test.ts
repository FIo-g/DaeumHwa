import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { proposals, scheduleItems, wikiEntries } from '@/db/schema'
import { addDays, seoulToday } from '@/lib/dates'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { recordChange } from './changes'
import { getWorkHome, listWorksWithStats } from './dashboard'
import { replaceOpenIssues, type NewIssue } from './issues'
import { saveResumePoint } from './user-state'
import { setWorkArchived } from './works'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function expectAppError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
}

async function makeOwnerWork(title = '테스트 작품') {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id, { title })
  return { owner, work, actor: { userId: owner.id } }
}

async function addPending(workId: string) {
  await db.insert(proposals).values({
    workId,
    type: 'entry_create',
    payload: {},
    source: 'manual',
    status: 'pending',
  })
}

describe('listWorksWithStats', () => {
  it('counts pending proposals, open threads, chapters and alerts per work', async () => {
    const { owner, work, actor } = await makeOwnerWork('별빛 연대기')
    const other = await createTestWork(db, owner.id, { title: '빈 작품' })
    for (let position = 1; position <= 8; position++) {
      await createTestChapter(db, work.id, { position, status: 'draft' })
    }
    await addPending(work.id)
    await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      targetChapterPosition: 6,
    })
    await createTestThread(db, work.id, { title: '끝난 떡밥', status: 'resolved' })

    const cards = await listWorksWithStats(db, actor)
    const card = cards.find((c) => c.work.id === work.id)!
    const emptyCard = cards.find((c) => c.work.id === other.id)!

    expect(cards).toHaveLength(2)
    expect(card.role).toBe('owner')
    expect(card.work.title).toBe('별빛 연대기')
    expect(card.chapterCount).toBe(8)
    expect(card.latestPosition).toBe(8)
    expect(card.lastEditedAt).toBeInstanceOf(Date)
    expect(card.pendingCount).toBe(1)
    expect(card.openThreadCount).toBe(1)
    // Overdue thread (target 6, latest 8) plus the buffer warning (no finished chapters).
    expect(card.alertCount).toBe(2)

    expect(emptyCard.chapterCount).toBe(0)
    expect(emptyCard.latestPosition).toBe(0)
    expect(emptyCard.lastEditedAt).toBeNull()
    expect(emptyCard.pendingCount).toBe(0)
    expect(emptyCard.openThreadCount).toBe(0)
  })

  it('hides archived works unless includeArchived is set', async () => {
    const { owner, work, actor } = await makeOwnerWork('보관할 작품')
    const archived = await createTestWork(db, owner.id, { title: '보관된 작품' })
    await setWorkArchived(db, actor, archived.id, true)

    const active = await listWorksWithStats(db, actor)
    const all = await listWorksWithStats(db, actor, { includeArchived: true })

    expect(active.map((c) => c.work.id)).toEqual([work.id])
    expect(all.map((c) => c.work.id).sort()).toEqual([work.id, archived.id].sort())
  })

  it('reports the caller role for a work joined as viewer, and skips works they do not belong to', async () => {
    const { owner, work } = await makeOwnerWork('공유 작품')
    await createTestWork(db, owner.id, { title: '비공개 작품' })
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')

    const cards = await listWorksWithStats(db, { userId: viewer.id })

    expect(cards).toHaveLength(1)
    expect(cards[0].work.id).toBe(work.id)
    expect(cards[0].role).toBe('viewer')
  })
})

describe('getWorkHome', () => {
  it('returns the highest-position draft as latestDraft and latest + 1 as nextPosition', async () => {
    const { work, actor } = await makeOwnerWork()
    await createTestChapter(db, work.id, { position: 1, status: 'done' })
    await createTestChapter(db, work.id, { position: 2, status: 'draft', title: '두 번째' })
    await createTestChapter(db, work.id, { position: 3, status: 'done' })
    const fourth = await createTestChapter(db, work.id, {
      position: 4,
      status: 'draft',
      title: '네 번째',
    })
    await createTestChapter(db, work.id, { position: 5, status: 'done' })

    const home = await getWorkHome(db, actor, work.id)

    expect(home.latestDraft).toEqual({ chapterId: fourth.id, position: 4, title: '네 번째' })
    expect(home.nextPosition).toBe(6)
    expect(home.chapterCount).toBe(5)
  })

  it('returns null latestDraft when every chapter is done, and nextPosition 1 for an empty work', async () => {
    const { work, actor } = await makeOwnerWork()

    const empty = await getWorkHome(db, actor, work.id)
    expect(empty.latestDraft).toBeNull()
    expect(empty.nextPosition).toBe(1)

    await createTestChapter(db, work.id, { position: 1, status: 'done' })
    const done = await getWorkHome(db, actor, work.id)
    expect(done.latestDraft).toBeNull()
  })

  it('returns the resume point saved for this work', async () => {
    const { work, actor } = await makeOwnerWork()
    await createTestChapter(db, work.id, { position: 1, status: 'done' })
    const second = await createTestChapter(db, work.id, {
      position: 2,
      status: 'draft',
      title: '두 번째',
    })
    await saveResumePoint(db, actor, {
      workId: work.id,
      chapterId: second.id,
      cursor: 10,
      path: `/works/${work.id}/chapters/${second.id}`,
    })

    const home = await getWorkHome(db, actor, work.id)

    expect(home.resume).toEqual({ chapterId: second.id, position: 2, title: '두 번째' })
  })

  it('lists open threads only, at most five, with the overdue flag', async () => {
    const { work, actor } = await makeOwnerWork()
    await createTestChapter(db, work.id, { position: 1, status: 'done' })
    await createTestChapter(db, work.id, { position: 2, status: 'done' })
    await createTestChapter(db, work.id, { position: 3, status: 'done' })
    await createTestThread(db, work.id, {
      title: '지난 목표',
      status: 'planted',
      targetChapterPosition: 2,
    })
    await createTestThread(db, work.id, { title: '끝', status: 'resolved' })

    const home = await getWorkHome(db, actor, work.id)

    expect(home.openThreads).toHaveLength(1)
    expect(home.openThreads[0]).toMatchObject({
      title: '지난 목표',
      status: 'planted',
      targetPosition: 2,
      overdue: true,
    })

    for (let i = 0; i < 6; i++) {
      await createTestThread(db, work.id, { title: `떡밥 ${i}`, status: 'developing' })
    }
    const capped = await getWorkHome(db, actor, work.id)
    expect(capped.openThreads).toHaveLength(5)
  })

  it('counts entries, open issues and pending proposals, ignoring archived entries', async () => {
    const { work, actor } = await makeOwnerWork()
    const chapter = await createTestChapter(db, work.id, { position: 1, status: 'done' })
    await createTestEntry(db, work.id, { name: '서윤' })
    const archived = await createTestEntry(db, work.id, { name: '민준' })
    await db
      .update(wikiEntries)
      .set({ archivedAt: new Date() })
      .where(eq(wikiEntries.id, archived.id))
    await addPending(work.id)
    const issue: NewIssue = {
      kind: 'naming',
      severity: 'low',
      quote: '서윤이 웃었다.',
      quoteStart: 0,
      quoteEnd: 8,
      entryId: null,
      factId: null,
      wikiExcerpt: '',
      explanation: '표기 확인',
      suggestion: '',
    }
    await replaceOpenIssues(db, {
      workId: work.id,
      chapterId: chapter.id,
      runId: null,
      issues: [issue],
    })

    const home = await getWorkHome(db, actor, work.id)

    expect(home.entryCount).toBe(1)
    expect(home.openIssueCount).toBe(1)
    expect(home.pendingCount).toBe(1)
  })

  it('returns the schedule summary: buffer, next publish date and next deadline', async () => {
    const { work, actor } = await makeOwnerWork()
    await createTestChapter(db, work.id, { position: 1, status: 'done' })
    await createTestChapter(db, work.id, { position: 2, status: 'done' })
    const today = seoulToday()
    await db.insert(scheduleItems).values({
      workId: work.id,
      kind: 'deadline',
      title: '3화 마감',
      date: addDays(today, 2),
      done: false,
    })

    const home = await getWorkHome(db, actor, work.id)

    expect(home.schedule.bufferCount).toBe(2)
    expect(home.schedule.nextPublishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(home.schedule.nextPublishDate! >= today).toBe(true)
    expect(home.schedule.bufferRunsOutOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(home.schedule.nextDeadline).toEqual({
      title: '3화 마감',
      date: addDays(today, 2),
      daysLeft: 2,
    })
  })

  it('includes the periodic alerts of the work', async () => {
    const { work, actor } = await makeOwnerWork()
    for (let position = 1; position <= 8; position++) {
      await createTestChapter(db, work.id, { position, status: 'done' })
    }
    await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      targetChapterPosition: 6,
    })

    const home = await getWorkHome(db, actor, work.id)

    expect(home.alerts.overdueThreads.map((t) => t.overdueBy)).toEqual([2])
    expect(home.alerts.total).toBe(1)
  })

  it('returns the most recent five changes, newest first', async () => {
    const { work, actor } = await makeOwnerWork()
    const thread = await createTestThread(db, work.id, { title: '반지' })
    for (let i = 1; i <= 6; i++) {
      await recordChange(db, {
        workId: work.id,
        targetTable: 'threads',
        targetId: thread.id,
        action: 'update',
        before: null,
        after: null,
        proposerType: 'author',
        actorId: actor.userId,
        summary: `변경 ${i}`,
      })
    }

    const home = await getWorkHome(db, actor, work.id)

    expect(home.recentChanges).toHaveLength(5)
    expect(home.recentChanges[0].summary).toBe('변경 6')
  })

  it('rejects non-members with NOT_FOUND', async () => {
    const { work } = await makeOwnerWork()
    const stranger = await createTestUser(db)

    await expectAppError(getWorkHome(db, { userId: stranger.id }, work.id), 'NOT_FOUND')
  })
})
