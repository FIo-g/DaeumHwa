import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { entryAppearances, proposals } from '@/db/schema'
import type { WorkSettings } from '@/db/types'
import { seoulToday } from '@/lib/dates'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { getPeriodicAlerts } from './alerts'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

const DAY_MS = 24 * 60 * 60 * 1000

async function makeWork(settings?: WorkSettings) {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id, { settings })
  return { owner, work }
}

/** Creates chapters at positions 1..n and returns their ids by position. */
async function makeChapters(workId: string, n: number, status: 'draft' | 'done' = 'draft') {
  const ids = new Map<number, string>()
  for (let position = 1; position <= n; position++) {
    const chapter = await createTestChapter(db, workId, { position, status })
    ids.set(position, chapter.id)
  }
  return ids
}

async function appear(entryId: string, chapterId: string) {
  await db.insert(entryAppearances).values({ entryId, chapterId, mentionCount: 1 })
}

describe('getPeriodicAlerts: overdue threads', () => {
  it('lists an open thread past its target chapter with overdueBy', async () => {
    const { work } = await makeWork()
    await makeChapters(work.id, 8)
    const thread = await createTestThread(db, work.id, {
      title: '잃어버린 반지',
      status: 'planted',
      targetChapterPosition: 6,
    })

    const alerts = await getPeriodicAlerts(db, work.id)

    expect(alerts.overdueThreads).toEqual([
      {
        id: thread.id,
        title: '잃어버린 반지',
        targetPosition: 6,
        latestPosition: 8,
        overdueBy: 2,
      },
    ])
  })

  it('never lists resolved, discarded, planned or untargeted threads', async () => {
    const { work } = await makeWork()
    await makeChapters(work.id, 8)
    await createTestThread(db, work.id, {
      title: '회수됨',
      status: 'resolved',
      targetChapterPosition: 6,
    })
    await createTestThread(db, work.id, {
      title: '버림',
      status: 'discarded',
      targetChapterPosition: 6,
    })
    await createTestThread(db, work.id, {
      title: '계획',
      status: 'planned',
      targetChapterPosition: 6,
    })
    await createTestThread(db, work.id, { title: '목표 없음', status: 'planted' })

    const alerts = await getPeriodicAlerts(db, work.id)

    expect(alerts.overdueThreads).toEqual([])
  })

  it('does not list a thread whose target is not yet passed', async () => {
    const { work } = await makeWork()
    await makeChapters(work.id, 6)
    await createTestThread(db, work.id, {
      title: '아직',
      status: 'developing',
      targetChapterPosition: 6,
    })

    const alerts = await getPeriodicAlerts(db, work.id)

    expect(alerts.overdueThreads).toEqual([])
  })
})

describe('getPeriodicAlerts: absent characters', () => {
  it('lists a character absent for exactly the threshold, not one less', async () => {
    const { work } = await makeWork()
    const ids = await makeChapters(work.id, 11)
    const seoyun = await createTestEntry(db, work.id, { name: '서윤', kind: 'character' })
    const minjun = await createTestEntry(db, work.id, { name: '민준', kind: 'character' })
    await appear(seoyun.id, ids.get(1)!)
    await appear(minjun.id, ids.get(2)!)

    const alerts = await getPeriodicAlerts(db, work.id)

    expect(alerts.absentCharacters).toEqual([
      { id: seoyun.id, name: '서윤', lastPosition: 1, chaptersSince: 10 },
    ])
  })

  it('uses the absence threshold from the work settings', async () => {
    const { work } = await makeWork({ absenceThreshold: 3 })
    const ids = await makeChapters(work.id, 5)
    const seoyun = await createTestEntry(db, work.id, { name: '서윤', kind: 'character' })
    await appear(seoyun.id, ids.get(1)!)

    const alerts = await getPeriodicAlerts(db, work.id)

    expect(alerts.absentCharacters.map((c) => c.name)).toEqual(['서윤'])
    expect(alerts.absentCharacters[0].chaptersSince).toBe(4)
  })

  it('never lists a character that never appeared, or an entry that is not a character', async () => {
    const { work } = await makeWork()
    const ids = await makeChapters(work.id, 12)
    await createTestEntry(db, work.id, { name: '미등장', kind: 'character' })
    const palace = await createTestEntry(db, work.id, { name: '왕궁', kind: 'place' })
    await appear(palace.id, ids.get(1)!)

    const alerts = await getPeriodicAlerts(db, work.id)

    expect(alerts.absentCharacters).toEqual([])
  })
})

describe('getPeriodicAlerts: stale proposals and buffer', () => {
  it('counts pending proposals older than 7 days as stale', async () => {
    const { work } = await makeWork()
    // Five finished chapters keep the buffer warning out of the total.
    for (let position = 1; position <= 5; position++) {
      await createTestChapter(db, work.id, { position, status: 'done' })
    }
    const now = Date.now()
    const base = {
      workId: work.id,
      type: 'entry_create' as const,
      payload: {},
      source: 'manual' as const,
    }
    await db.insert(proposals).values([
      { ...base, status: 'pending', createdAt: new Date(now - 8 * DAY_MS) },
      { ...base, status: 'pending', createdAt: new Date(now - 2 * DAY_MS) },
      { ...base, status: 'approved', createdAt: new Date(now - 30 * DAY_MS) },
    ])

    const alerts = await getPeriodicAlerts(db, work.id)

    expect(alerts.stalePendingCount).toBe(1)
    expect(alerts.total).toBe(1)
  })

  it('warns when finished, unpublished chapters are below the buffer target', async () => {
    const { work } = await makeWork()

    const alerts = await getPeriodicAlerts(db, work.id)

    expect(alerts.bufferWarning).toBe('비축분이 목표(5화)보다 적습니다 (현재 0화).')
    expect(alerts.total).toBe(1)
  })

  it('has no buffer warning when the buffer target is met', async () => {
    const { work } = await makeWork()
    for (let position = 1; position <= 5; position++) {
      await createTestChapter(db, work.id, { position, status: 'done' })
    }

    const alerts = await getPeriodicAlerts(db, work.id, seoulToday())

    expect(alerts.bufferWarning).toBeNull()
    expect(alerts.total).toBe(0)
  })
})

describe('getPeriodicAlerts: total', () => {
  it('sums every alert kind', async () => {
    const { work } = await makeWork()
    const ids = await makeChapters(work.id, 11)
    const seoyun = await createTestEntry(db, work.id, { name: '서윤', kind: 'character' })
    await appear(seoyun.id, ids.get(1)!)
    await createTestThread(db, work.id, {
      title: '반지',
      status: 'planted',
      targetChapterPosition: 9,
    })
    await db.insert(proposals).values({
      workId: work.id,
      type: 'entry_create',
      payload: {},
      source: 'manual',
      status: 'pending',
      createdAt: new Date(Date.now() - 9 * DAY_MS),
    })

    const alerts = await getPeriodicAlerts(db, work.id)

    // overdue thread (1) + absent character (1) + stale proposals (1) + buffer warning (1)
    expect(alerts.overdueThreads).toHaveLength(1)
    expect(alerts.absentCharacters).toHaveLength(1)
    expect(alerts.stalePendingCount).toBe(1)
    expect(alerts.bufferWarning).not.toBeNull()
    expect(alerts.total).toBe(4)
  })
})
