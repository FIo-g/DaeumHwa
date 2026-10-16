import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { resolveWorkSettings } from '@/db/types'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import {
  createScheduleItem,
  deleteScheduleItem,
  getScheduleInput,
  listScheduleItems,
  setScheduleItemDone,
  updateScheduleItem,
} from './schedule'

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

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id, {
    settings: { chaptersPerPublishDay: 2, bufferTarget: 3 },
  })
  const editor = await createTestUser(db)
  await addTestMember(db, work.id, editor.id, 'editor')
  const viewer = await createTestUser(db)
  await addTestMember(db, work.id, viewer.id, 'viewer')
  const stranger = await createTestUser(db)
  return {
    owner: { userId: owner.id },
    editor: { userId: editor.id },
    viewer: { userId: viewer.id },
    stranger: { userId: stranger.id },
    workId: work.id,
  }
}

describe('createScheduleItem', () => {
  it('turns a hiatus without an end date into a one-day hiatus', async () => {
    const s = await setup()
    const item = await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'hiatus',
      title: '',
      date: '2026-11-02',
    })
    expect(item.endDate).toBe('2026-11-02')
    expect(item.title).toBe('휴재')
    expect(item.done).toBe(false)
  })

  it('keeps a hiatus range as given', async () => {
    const s = await setup()
    const item = await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'hiatus',
      title: '여름 휴재',
      date: '2026-08-01',
      endDate: '2026-08-10',
    })
    expect(item.endDate).toBe('2026-08-10')
    expect(item.title).toBe('여름 휴재')
  })

  it('rejects an end date before the start date with VALIDATION', async () => {
    const s = await setup()
    await expectAppError(
      createScheduleItem(db, s.editor, {
        workId: s.workId,
        kind: 'hiatus',
        title: '',
        date: '2026-08-10',
        endDate: '2026-08-01',
      }),
      'VALIDATION',
    )
  })

  it('does not let a viewer create items', async () => {
    const s = await setup()
    await expectAppError(
      createScheduleItem(db, s.viewer, {
        workId: s.workId,
        kind: 'deadline',
        title: '마감',
        date: '2026-10-20',
      }),
      'FORBIDDEN',
    )
  })

  it('rejects a chapter from another work with NOT_FOUND', async () => {
    const s = await setup()
    const other = await createTestWork(db, s.owner.userId)
    const otherChapter = await createTestChapter(db, other.id, { position: 1 })
    await expectAppError(
      createScheduleItem(db, s.editor, {
        workId: s.workId,
        kind: 'publish',
        title: '',
        date: '2026-10-20',
        chapterId: otherChapter.id,
      }),
      'NOT_FOUND',
    )
  })
})

describe('listScheduleItems', () => {
  it('returns items whose span overlaps the range, ordered by date', async () => {
    const s = await setup()
    await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'deadline',
      title: '초고 마감',
      date: '2026-10-20',
    })
    await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'hiatus',
      title: '휴재',
      date: '2026-10-10',
      endDate: '2026-10-14',
    })
    await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'event',
      title: '북토크',
      date: '2026-11-30',
    })
    const rows = await listScheduleItems(db, s.viewer, s.workId, {
      from: '2026-10-12',
      to: '2026-10-31',
    })
    expect(rows.map((r) => r.title)).toEqual(['휴재', '초고 마감'])
  })

  it('returns NOT_FOUND to a non-member', async () => {
    const s = await setup()
    await expectAppError(listScheduleItems(db, s.stranger, s.workId), 'NOT_FOUND')
  })
})

describe('updateScheduleItem and setScheduleItemDone', () => {
  it('moves a one-day hiatus without losing its span', async () => {
    const s = await setup()
    const item = await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'hiatus',
      title: '',
      date: '2026-08-01',
      endDate: '2026-08-03',
    })
    const moved = await updateScheduleItem(db, s.editor, item.id, { date: '2026-09-01' })
    expect(moved.date).toBe('2026-09-01')
    expect(moved.endDate).toBe('2026-09-03')
  })

  it('updates the note and clears the chapter link', async () => {
    const s = await setup()
    const chapter = await createTestChapter(db, s.workId, { position: 2 })
    const item = await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'publish',
      title: '',
      date: '2026-10-20',
      chapterId: chapter.id,
    })
    const updated = await updateScheduleItem(db, s.editor, item.id, {
      note: '표지 교체',
      chapterId: null,
    })
    expect(updated.note).toBe('표지 교체')
    expect(updated.chapterId).toBeNull()
  })

  it('marks an item done and back', async () => {
    const s = await setup()
    const item = await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'deadline',
      title: '마감',
      date: '2026-10-20',
    })
    const done = await setScheduleItemDone(db, s.editor, { itemId: item.id, done: true })
    expect(done.done).toBe(true)
  })

  it('does not let a viewer edit items', async () => {
    const s = await setup()
    const item = await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'deadline',
      title: '마감',
      date: '2026-10-20',
    })
    await expectAppError(updateScheduleItem(db, s.viewer, item.id, { title: '바꿈' }), 'FORBIDDEN')
  })
})

describe('deleteScheduleItem', () => {
  it('hard-deletes the item', async () => {
    const s = await setup()
    const item = await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'event',
      title: '북토크',
      date: '2026-11-30',
    })
    await deleteScheduleItem(db, s.editor, item.id)
    await expect(listScheduleItems(db, s.viewer, s.workId)).resolves.toEqual([])
  })
})

describe('getScheduleInput', () => {
  it('returns resolved settings and chapters ordered by position', async () => {
    const s = await setup()
    await createTestChapter(db, s.workId, { position: 3, status: 'done' })
    await createTestChapter(db, s.workId, {
      position: 1,
      status: 'done',
      publishedOn: '2026-10-01',
    })
    await createTestChapter(db, s.workId, { position: 2 })
    await createScheduleItem(db, s.editor, {
      workId: s.workId,
      kind: 'deadline',
      title: '마감',
      date: '2026-10-20',
    })

    const input = await getScheduleInput(db, s.viewer, s.workId)
    expect(input.settings).toEqual(
      resolveWorkSettings({ chaptersPerPublishDay: 2, bufferTarget: 3 }),
    )
    expect(input.chapters.map((c) => c.position)).toEqual([1, 2, 3])
    expect(input.chapters[0].publishedOn).toBe('2026-10-01')
    expect(input.items.map((i) => i.title)).toEqual(['마감'])
  })

  it('returns NOT_FOUND to a non-member', async () => {
    const s = await setup()
    await expectAppError(getScheduleInput(db, s.stranger, s.workId), 'NOT_FOUND')
  })
})
