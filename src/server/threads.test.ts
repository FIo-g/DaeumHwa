import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog, threadEvents, threads } from '@/db/schema'
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
import {
  addThreadEvent,
  archiveThread,
  archiveThreadEvent,
  createThread,
  getThread,
  listThreads,
  updateThread,
} from './threads'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function expectAppError(p: Promise<unknown>, code: string, message?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  if (message !== undefined) expect((err as AppError).message).toBe(message)
}

async function makeWork() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  const actor = { userId: owner.id }
  const chapterAt = (position: number) =>
    createTestChapter(db, work.id, { position, title: `${position}화 제목` })
  return { owner, work, actor, chapterAt }
}

async function changeCount(workId: string): Promise<number> {
  const rows = await db.select().from(changeLog).where(eq(changeLog.workId, workId))
  return rows.length
}

async function threadRow(threadId: string) {
  const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1)
  return row
}

describe('createThread', () => {
  it('rejects a planted thread without a planted chapter with VALIDATION', async () => {
    const { actor, work } = await makeWork()
    await expectAppError(
      createThread(db, actor, { workId: work.id, title: '비밀 편지', status: 'planted' }),
      'VALIDATION',
      '심은 회차를 선택하세요.',
    )
  })

  it('creates a planted thread with a planted event and two change rows', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    const thread = await createThread(db, actor, {
      workId: work.id,
      title: '비밀 편지',
      status: 'planted',
      plantedChapterId: ch3.id,
      targetChapterPosition: 6,
    })
    expect(thread.status).toBe('planted')
    expect(thread.plantedChapterId).toBe(ch3.id)
    expect(thread.importance).toBe('medium')

    const events = await db.select().from(threadEvents).where(eq(threadEvents.threadId, thread.id))
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('planted')
    expect(events[0].chapterId).toBe(ch3.id)

    expect(await changeCount(work.id)).toBe(2)
  })

  it('creates a planned thread with no events and stores related entries in the snapshot', async () => {
    const { actor, work } = await makeWork()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const thread = await createThread(db, actor, {
      workId: work.id,
      title: '결말의 진실',
      status: 'planned',
      relatedEntryIds: [entry.id],
    })
    expect(thread.status).toBe('planned')
    expect(thread.plantedChapterId).toBeNull()

    const events = await db.select().from(threadEvents).where(eq(threadEvents.threadId, thread.id))
    expect(events).toHaveLength(0)

    const [change] = await db
      .select()
      .from(changeLog)
      .where(and(eq(changeLog.workId, work.id), eq(changeLog.targetTable, 'threads')))
    expect(change.action).toBe('create')
    expect(change.after).toMatchObject({ relatedEntryIds: [entry.id] })
  })

  it('rejects a viewer with FORBIDDEN', async () => {
    const { work } = await makeWork()
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expectAppError(
      createThread(
        db,
        { userId: viewer.id },
        { workId: work.id, title: '떡밥', status: 'planned' },
      ),
      'FORBIDDEN',
    )
  })
})

describe('addThreadEvent', () => {
  it('a planted event moves a planned thread to planted', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch2 = await chapterAt(2)
    const thread = await createTestThread(db, work.id, { title: '반지', status: 'planned' })

    const event = await addThreadEvent(db, actor, {
      threadId: thread.id,
      kind: 'planted',
      chapterId: ch2.id,
    })
    expect(event.kind).toBe('planted')
    const after = await threadRow(thread.id)
    expect(after.status).toBe('planted')
    expect(after.plantedChapterId).toBe(ch2.id)
  })

  it('rejects a developed event on a thread that was never planted', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch2 = await chapterAt(2)
    const thread = await createTestThread(db, work.id, { title: '반지', status: 'planned' })
    await expectAppError(
      addThreadEvent(db, actor, { threadId: thread.id, kind: 'developed', chapterId: ch2.id }),
      'VALIDATION',
      '아직 심지 않은 떡밥입니다. 먼저 심은 회차를 기록하세요.',
    )
  })

  it('rejects planting a thread that is already planted with BAD_STATE', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch2 = await chapterAt(2)
    const thread = await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      plantedChapterId: ch2.id,
    })
    await expectAppError(
      addThreadEvent(db, actor, { threadId: thread.id, kind: 'planted', chapterId: ch2.id }),
      'BAD_STATE',
      '이미 심은 떡밥입니다.',
    )
  })

  it('requires a chapter for planted events', async () => {
    const { actor, work } = await makeWork()
    const thread = await createTestThread(db, work.id, { title: '반지', status: 'planned' })
    await expectAppError(
      addThreadEvent(db, actor, { threadId: thread.id, kind: 'planted' }),
      'VALIDATION',
      '회차를 선택하세요.',
    )
  })

  it('allows development in the planting chapter and moves the thread to developing', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    const thread = await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      plantedChapterId: ch3.id,
    })
    await addThreadEvent(db, actor, { threadId: thread.id, kind: 'developed', chapterId: ch3.id })
    expect((await threadRow(thread.id)).status).toBe('developing')
  })

  it('rejects development before the planting chapter', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    const ch2 = await chapterAt(2)
    const thread = await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      plantedChapterId: ch3.id,
    })
    await expectAppError(
      addThreadEvent(db, actor, { threadId: thread.id, kind: 'developed', chapterId: ch2.id }),
      'VALIDATION',
      '발전 기록은 떡밥을 심은 회차(3화) 이후여야 합니다.',
    )
  })

  it('rejects resolving in the planting chapter', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    const thread = await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      plantedChapterId: ch3.id,
    })
    await expectAppError(
      addThreadEvent(db, actor, { threadId: thread.id, kind: 'resolved', chapterId: ch3.id }),
      'VALIDATION',
      '회수는 떡밥을 심은 회차(3화) 이후에만 기록할 수 있습니다.',
    )
  })

  it('resolves a thread in a later chapter and stores resolvedChapterId', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    const ch5 = await chapterAt(5)
    const thread = await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      plantedChapterId: ch3.id,
    })
    await addThreadEvent(db, actor, { threadId: thread.id, kind: 'resolved', chapterId: ch5.id })
    const after = await threadRow(thread.id)
    expect(after.status).toBe('resolved')
    expect(after.resolvedChapterId).toBe(ch5.id)
  })

  it('blocks non-note events on a resolved thread with BAD_STATE, but allows notes', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    const ch5 = await chapterAt(5)
    const thread = await createTestThread(db, work.id, {
      title: '반지',
      status: 'resolved',
      plantedChapterId: ch3.id,
    })
    await expectAppError(
      addThreadEvent(db, actor, { threadId: thread.id, kind: 'developed', chapterId: ch5.id }),
      'BAD_STATE',
      '이미 회수되었거나 폐기된 떡밥입니다.',
    )
    const note = await addThreadEvent(db, actor, {
      threadId: thread.id,
      kind: 'note',
      note: '메모',
    })
    expect(note.kind).toBe('note')
  })

  it('records two change rows (event create and thread update) per event', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    const thread = await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      plantedChapterId: ch3.id,
    })
    const before = await changeCount(work.id)
    await addThreadEvent(db, actor, { threadId: thread.id, kind: 'developed', chapterId: ch3.id })
    expect((await changeCount(work.id)) - before).toBe(2)
  })

  it('rejects a chapter from another work with NOT_FOUND', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    const otherOwner = await createTestUser(db)
    const otherWork = await createTestWork(db, otherOwner.id)
    const foreign = await createTestChapter(db, otherWork.id, { position: 1 })
    const thread = await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      plantedChapterId: ch3.id,
    })
    await expectAppError(
      addThreadEvent(db, actor, { threadId: thread.id, kind: 'developed', chapterId: foreign.id }),
      'NOT_FOUND',
    )
  })

  it('discards a thread without a chapter', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    const thread = await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      plantedChapterId: ch3.id,
    })
    await addThreadEvent(db, actor, { threadId: thread.id, kind: 'discarded' })
    expect((await threadRow(thread.id)).status).toBe('discarded')
  })
})

describe('listThreads and getThread', () => {
  it('marks open threads past their target chapter as overdue', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch3 = await chapterAt(3)
    await chapterAt(8)
    const late = await createTestThread(db, work.id, {
      title: '늦은 떡밥',
      status: 'planted',
      plantedChapterId: ch3.id,
      targetChapterPosition: 6,
    })
    const resolved = await createTestThread(db, work.id, {
      title: '끝난 떡밥',
      status: 'resolved',
      plantedChapterId: ch3.id,
      targetChapterPosition: 6,
    })

    const views = await listThreads(db, actor, work.id)
    const lateView = views.find((v) => v.id === late.id)
    const resolvedView = views.find((v) => v.id === resolved.id)
    expect(lateView?.overdue).toBe(true)
    expect(lateView?.latestPosition).toBe(8)
    expect(lateView?.plantedPosition).toBe(3)
    expect(resolvedView?.overdue).toBe(false)
  })

  it('orders by importance then planted position, and filters by status', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch1 = await chapterAt(1)
    const ch4 = await chapterAt(4)
    await createTestThread(db, work.id, {
      title: '낮은 것',
      status: 'planted',
      plantedChapterId: ch1.id,
    })
    await db.update(threads).set({ importance: 'low' }).where(eq(threads.workId, work.id))
    const high = await createTestThread(db, work.id, {
      title: '높은 것',
      status: 'planted',
      plantedChapterId: ch4.id,
    })
    await db.update(threads).set({ importance: 'high' }).where(eq(threads.id, high.id))
    const planned = await createTestThread(db, work.id, { title: '계획', status: 'planned' })

    const all = await listThreads(db, actor, work.id)
    expect(all[0].id).toBe(high.id)
    expect(all.map((v) => v.id)).toContain(planned.id)

    const onlyPlanned = await listThreads(db, actor, work.id, { statuses: ['planned'] })
    expect(onlyPlanned.map((v) => v.id)).toEqual([planned.id])
  })

  it('hides archived threads unless includeArchived is set', async () => {
    const { actor, work } = await makeWork()
    const thread = await createTestThread(db, work.id, { title: '보관', status: 'planned' })
    await archiveThread(db, actor, thread.id)
    expect(await listThreads(db, actor, work.id)).toHaveLength(0)
    expect(await listThreads(db, actor, work.id, { includeArchived: true })).toHaveLength(1)
  })

  it('returns events of a thread ordered by chapter position with chapter info', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch2 = await chapterAt(2)
    const ch6 = await chapterAt(6)
    const ch4 = await chapterAt(4)
    const thread = await createThread(db, actor, {
      workId: work.id,
      title: '반지',
      status: 'planted',
      plantedChapterId: ch2.id,
    })
    await addThreadEvent(db, actor, { threadId: thread.id, kind: 'developed', chapterId: ch6.id })
    await addThreadEvent(db, actor, { threadId: thread.id, kind: 'developed', chapterId: ch4.id })

    const detail = await getThread(db, actor, thread.id)
    expect(detail.events.map((e) => e.chapterPosition)).toEqual([2, 4, 6])
    expect(detail.events[0].chapterTitle).toBe('2화 제목')
  })
})

describe('updateThread, archiveThread and archiveThreadEvent', () => {
  it('updates fields, replaces related entries and records a change', async () => {
    const { actor, work } = await makeWork()
    const a = await createTestEntry(db, work.id, { name: '이서윤' })
    const b = await createTestEntry(db, work.id, { name: '박도윤' })
    const thread = await createThread(db, actor, {
      workId: work.id,
      title: '편지',
      status: 'planned',
      relatedEntryIds: [a.id],
    })
    const updated = await updateThread(db, actor, thread.id, {
      title: '잃어버린 편지',
      importance: 'high',
      targetChapterPosition: 9,
      relatedEntryIds: [b.id],
    })
    expect(updated.title).toBe('잃어버린 편지')
    expect(updated.importance).toBe('high')
    expect(updated.targetChapterPosition).toBe(9)

    const view = (await listThreads(db, actor, work.id))[0]
    expect(view.relatedEntries.map((e) => e.id)).toEqual([b.id])

    const changes = await db
      .select()
      .from(changeLog)
      .where(and(eq(changeLog.workId, work.id), eq(changeLog.action, 'update')))
    expect(changes.length).toBeGreaterThan(0)
  })

  it('archives a thread, and a second archive is BAD_STATE', async () => {
    const { actor, work } = await makeWork()
    const thread = await createTestThread(db, work.id, { title: '보관', status: 'planned' })
    await archiveThread(db, actor, thread.id)
    expect((await threadRow(thread.id)).archivedAt).not.toBeNull()
    await expectAppError(archiveThread(db, actor, thread.id), 'BAD_STATE')
  })

  it('archives an event and drops it from the event count', async () => {
    const { actor, work, chapterAt } = await makeWork()
    const ch1 = await chapterAt(1)
    const thread = await createThread(db, actor, {
      workId: work.id,
      title: '반지',
      status: 'planted',
      plantedChapterId: ch1.id,
    })
    expect((await listThreads(db, actor, work.id))[0].eventCount).toBe(1)
    const note = await addThreadEvent(db, actor, {
      threadId: thread.id,
      kind: 'note',
      note: '메모',
    })
    expect((await listThreads(db, actor, work.id))[0].eventCount).toBe(2)

    await archiveThreadEvent(db, actor, note.id)
    expect((await listThreads(db, actor, work.id))[0].eventCount).toBe(1)
    const [row] = await db.select().from(threadEvents).where(eq(threadEvents.id, note.id))
    expect(row.archivedAt).not.toBeNull()
  })
})
