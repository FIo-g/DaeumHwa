import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog, chapters, chapterVersions, entryAppearances } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import {
  archiveChapter,
  createChapter,
  createChaptersBulk,
  getChapter,
  getLatestPosition,
  getVersion,
  listChapters,
  listVersions,
  moveChapter,
  openNextChapter,
  restoreChapter,
  restoreVersion,
  saveChapter,
  setChapterPublishedOn,
  setChapterStatus,
  setChapterSummary,
} from './chapters'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  vi.useRealTimers()
})

async function expectAppError(p: Promise<unknown>, code: string, message?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  if (message !== undefined) expect((err as AppError).message).toBe(message)
  return err as AppError
}

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  return { owner, actor: { userId: owner.id }, work }
}

describe('createChapter', () => {
  it("defaults title '1화' and position 1, then '2화'", async () => {
    const { actor, work } = await setup()
    const first = await createChapter(db, actor, { workId: work.id })
    expect(first.position).toBe(1)
    expect(first.title).toBe('1화')
    expect(first.version).toBe(1)
    const second = await createChapter(db, actor, { workId: work.id })
    expect(second.position).toBe(2)
    expect(second.title).toBe('2화')
  })

  it('writes the first version row with the given source', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, {
      workId: work.id,
      body: '처음 원고',
      versionSource: 'ai_draft',
    })
    const versions = await listVersions(db, actor, chapter.id)
    expect(versions).toHaveLength(1)
    expect(versions[0].source).toBe('ai_draft')
    expect(versions[0].version).toBe(1)
  })

  it('shifts later chapters when an explicit position is taken', async () => {
    const { actor, work } = await setup()
    await createChapter(db, actor, { workId: work.id })
    await createChapter(db, actor, { workId: work.id })
    const inserted = await createChapter(db, actor, { workId: work.id, position: 1 })
    expect(inserted.position).toBe(1)
    const list = await listChapters(db, actor, work.id)
    expect(list.map((c) => c.position)).toEqual([1, 2, 3])
    expect(list.map((c) => c.title)).toEqual(['1화', '1화', '2화'])
  })

  it('rejects a viewer with FORBIDDEN', async () => {
    const { work } = await setup()
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expectAppError(createChapter(db, { userId: viewer.id }, { workId: work.id }), 'FORBIDDEN')
  })
})

describe('saveChapter', () => {
  it('increments version and counts', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id })
    const saved = await saveChapter(db, actor, {
      chapterId: chapter.id,
      body: '가 나\n다',
      expectedVersion: 1,
    })
    expect(saved.version).toBe(2)
    expect(saved.charCount).toBe(4)
    expect(saved.charCountNoSpaces).toBe(3)
    expect(saved.title).toBe('1화')
  })

  it('keeps fields that are not in the input', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id, body: '원래 본문' })
    const saved = await saveChapter(db, actor, {
      chapterId: chapter.id,
      title: '새 제목',
      expectedVersion: 1,
    })
    expect(saved.title).toBe('새 제목')
    expect(saved.body).toBe('원래 본문')
  })

  it('with a stale expectedVersion throws CONFLICT carrying the current version', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id })
    await saveChapter(db, actor, { chapterId: chapter.id, body: 'a', expectedVersion: 1 })
    const err = await expectAppError(
      saveChapter(db, actor, { chapterId: chapter.id, body: 'b', expectedVersion: 1 }),
      'CONFLICT',
      '다른 곳에서 먼저 수정된 원고가 있습니다.',
    )
    expect(err.details).toEqual({ currentVersion: 2 })
    const [row] = await db.select().from(chapters).where(eq(chapters.id, chapter.id))
    expect(row.body).toBe('a')
  })

  it('within 10 minutes coalesces into one version row', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T01:00:00Z'))
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id, body: '초안' })
    vi.setSystemTime(new Date('2026-10-16T01:01:00Z'))
    await saveChapter(db, actor, { chapterId: chapter.id, body: '첫 저장', expectedVersion: 1 })
    vi.setSystemTime(new Date('2026-10-16T01:03:00Z'))
    await saveChapter(db, actor, { chapterId: chapter.id, body: '둘째 저장', expectedVersion: 2 })

    const versions = await listVersions(db, actor, chapter.id)
    // Initial version (creation) + one merged save row.
    expect(versions).toHaveLength(2)
    expect(versions[0].version).toBe(3)
    const full = await getVersion(db, actor, versions[0].id)
    expect(full.body).toBe('둘째 저장')
    expect(full.charCount).toBe('둘째 저장'.length)
    const initial = await getVersion(db, actor, versions[1].id)
    expect(initial.body).toBe('초안')
  })

  it('after 11 minutes adds a new version row', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T01:00:00Z'))
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id, body: '초안' })
    vi.setSystemTime(new Date('2026-10-16T01:01:00Z'))
    await saveChapter(db, actor, { chapterId: chapter.id, body: '첫 저장', expectedVersion: 1 })
    vi.setSystemTime(new Date('2026-10-16T01:12:01Z'))
    await saveChapter(db, actor, { chapterId: chapter.id, body: '나중 저장', expectedVersion: 2 })
    const versions = await listVersions(db, actor, chapter.id)
    expect(versions).toHaveLength(3)
  })

  it('does not coalesce into a row written by another user', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T01:00:00Z'))
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id, body: '초안' })
    vi.setSystemTime(new Date('2026-10-16T01:01:00Z'))
    await saveChapter(db, actor, { chapterId: chapter.id, body: '첫 저장', expectedVersion: 1 })
    const coEditor = await createTestUser(db)
    await addTestMember(db, work.id, coEditor.id, 'editor')
    vi.setSystemTime(new Date('2026-10-16T01:02:00Z'))
    await saveChapter(
      db,
      { userId: coEditor.id },
      {
        chapterId: chapter.id,
        body: '동료 저장',
        expectedVersion: 2,
      },
    )
    expect(await listVersions(db, actor, chapter.id)).toHaveLength(3)
  })

  it('ai_draft and restore sources always add a new version row', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T01:00:00Z'))
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id, body: '초안' })
    await saveChapter(db, actor, {
      chapterId: chapter.id,
      body: 'AI 초안',
      expectedVersion: 1,
      source: 'ai_draft',
    })
    await saveChapter(db, actor, {
      chapterId: chapter.id,
      body: 'AI 초안 수정',
      expectedVersion: 2,
      source: 'ai_draft',
    })
    expect(await listVersions(db, actor, chapter.id)).toHaveLength(3)
  })

  it('writes entry appearances from the new body', async () => {
    const { actor, work } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '라온' })
    const chapter = await createChapter(db, actor, { workId: work.id })
    await saveChapter(db, actor, {
      chapterId: chapter.id,
      body: '라온이 달렸다. 라온은 웃었다.',
      expectedVersion: 1,
    })
    const rows = await db
      .select()
      .from(entryAppearances)
      .where(eq(entryAppearances.chapterId, chapter.id))
    expect(rows).toEqual([{ entryId: entry.id, chapterId: chapter.id, mentionCount: 2 }])
  })

  it('viewer cannot save: FORBIDDEN', async () => {
    const { work, actor } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id })
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expectAppError(
      saveChapter(
        db,
        { userId: viewer.id },
        {
          chapterId: chapter.id,
          body: 'x',
          expectedVersion: 1,
        },
      ),
      'FORBIDDEN',
    )
  })

  it('rejects an archived chapter with BAD_STATE', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id })
    await archiveChapter(db, actor, chapter.id)
    await expectAppError(
      saveChapter(db, actor, { chapterId: chapter.id, body: 'x', expectedVersion: 1 }),
      'BAD_STATE',
    )
  })
})

describe('restoreVersion', () => {
  it('creates a new version with the old body', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T01:00:00Z'))
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id, body: '옛 본문' })
    vi.setSystemTime(new Date('2026-10-16T02:00:00Z'))
    await saveChapter(db, actor, { chapterId: chapter.id, body: '새 본문', expectedVersion: 1 })
    const before = await listVersions(db, actor, chapter.id)
    const oldVersion = before[before.length - 1]

    const restored = await restoreVersion(db, actor, {
      versionId: oldVersion.id,
      expectedVersion: 2,
    })
    expect(restored.body).toBe('옛 본문')
    expect(restored.version).toBe(3)
    const versions = await listVersions(db, actor, chapter.id)
    expect(versions).toHaveLength(3)
    expect(versions[0].source).toBe('restore')
  })

  it('a non-member gets NOT_FOUND for the version id', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id, body: 'x' })
    const versions = await listVersions(db, actor, chapter.id)
    const stranger = await createTestUser(db)
    await expectAppError(
      restoreVersion(
        db,
        { userId: stranger.id },
        { versionId: versions[0].id, expectedVersion: 1 },
      ),
      'NOT_FOUND',
    )
  })
})

describe('moveChapter', () => {
  it('swaps positions with the neighbour', async () => {
    const { actor, work } = await setup()
    const a = await createChapter(db, actor, { workId: work.id, title: 'A' })
    const b = await createChapter(db, actor, { workId: work.id, title: 'B' })
    await moveChapter(db, actor, b.id, 'up')
    const list = await listChapters(db, actor, work.id)
    expect(list.map((c) => c.id)).toEqual([b.id, a.id])
    expect(list.map((c) => c.position)).toEqual([1, 2])
  })

  it('is a no-op at the ends', async () => {
    const { actor, work } = await setup()
    const a = await createChapter(db, actor, { workId: work.id })
    const b = await createChapter(db, actor, { workId: work.id })
    await moveChapter(db, actor, a.id, 'up')
    await moveChapter(db, actor, b.id, 'down')
    const list = await listChapters(db, actor, work.id)
    expect(list.map((c) => c.id)).toEqual([a.id, b.id])
  })
})

describe('archive and restore', () => {
  it('hides archived chapters by default and restores them at a free position', async () => {
    const { actor, work } = await setup()
    await createChapter(db, actor, { workId: work.id })
    const second = await createChapter(db, actor, { workId: work.id })
    await archiveChapter(db, actor, second.id)
    expect(await listChapters(db, actor, work.id)).toHaveLength(1)
    expect(await listChapters(db, actor, work.id, { includeArchived: true })).toHaveLength(2)
    expect(await getLatestPosition(db, work.id)).toBe(1)

    const restored = await restoreChapter(db, actor, second.id)
    expect(restored.archivedAt).toBeNull()
    expect(restored.position).toBe(2)
  })

  it('restore moves the chapter to the end when its position was taken', async () => {
    const { actor, work } = await setup()
    await createChapter(db, actor, { workId: work.id })
    const second = await createChapter(db, actor, { workId: work.id })
    await archiveChapter(db, actor, second.id)
    // Position 2 is free again, so a new chapter takes it.
    await createChapter(db, actor, { workId: work.id })
    const restored = await restoreChapter(db, actor, second.id)
    expect(restored.position).toBe(3)
  })
})

describe('setChapterStatus and setChapterPublishedOn', () => {
  it('updates status', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id })
    const updated = await setChapterStatus(db, actor, chapter.id, 'done')
    expect(updated.status).toBe('done')
  })

  it('sets and clears publishedOn and rejects a malformed date', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id })
    const set = await setChapterPublishedOn(db, actor, chapter.id, '2026-10-20')
    expect(set.publishedOn).toBe('2026-10-20')
    const cleared = await setChapterPublishedOn(db, actor, chapter.id, null)
    expect(cleared.publishedOn).toBeNull()
    await expectAppError(setChapterPublishedOn(db, actor, chapter.id, '10/20'), 'VALIDATION')
  })
})

describe('getChapter and listChapters', () => {
  it('a non-member getChapter gets NOT_FOUND', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id })
    const stranger = await createTestUser(db)
    await expectAppError(getChapter(db, { userId: stranger.id }, chapter.id), 'NOT_FOUND')
  })

  it('returns the chapter with my role', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id, body: '본문' })
    const found = await getChapter(db, actor, chapter.id)
    expect(found.role).toBe('owner')
    expect(found.body).toBe('본문')
  })

  it('listChapters omits the body', async () => {
    const { actor, work } = await setup()
    await createChapter(db, actor, { workId: work.id, body: '본문' })
    const [item] = await listChapters(db, actor, work.id)
    expect('body' in item).toBe(false)
    expect(item.charCount).toBe(2)
  })
})

describe('setChapterSummary', () => {
  it('records a change_log row', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id, title: '재회' })
    const updated = await setChapterSummary(db, actor, {
      chapterId: chapter.id,
      summary: '라온이 떠난다.',
      proposerType: 'ai',
      proposalId: null,
    })
    expect(updated.summary).toBe('라온이 떠난다.')
    const [log] = await db.select().from(changeLog).where(eq(changeLog.targetId, chapter.id))
    expect(log.targetTable).toBe('chapters')
    expect(log.action).toBe('update')
    expect(log.before).toEqual({ summary: '' })
    expect(log.after).toEqual({ summary: '라온이 떠난다.' })
    expect(log.proposerType).toBe('ai')
    expect(log.summary).toBe('회차 요약 수정: 1화 재회')
  })
})

describe('openNextChapter', () => {
  it('returns the newest draft chapter when one exists', async () => {
    const { actor, work } = await setup()
    await createTestChapter(db, work.id, { position: 1, status: 'draft' })
    const newest = await createTestChapter(db, work.id, { position: 2, status: 'draft' })
    await createTestChapter(db, work.id, { position: 3, status: 'done' })
    const result = await openNextChapter(db, actor, work.id)
    expect(result).toEqual({ chapterId: newest.id, created: false })
  })

  it('creates the next chapter when there is no draft', async () => {
    const { actor, work } = await setup()
    await createTestChapter(db, work.id, { position: 1, status: 'done' })
    const result = await openNextChapter(db, actor, work.id)
    expect(result.created).toBe(true)
    const chapter = await getChapter(db, actor, result.chapterId)
    expect(chapter.position).toBe(2)
    expect(chapter.title).toBe('2화')
  })
})

describe('createChaptersBulk', () => {
  it('appends after existing positions, in order, with import versions', async () => {
    const { actor, work } = await setup()
    await createTestChapter(db, work.id, { position: 1 })
    await createTestChapter(db, work.id, { position: 2 })
    const created = await createChaptersBulk(db, actor, {
      workId: work.id,
      chapters: [
        { title: '가져온 1', body: '하나' },
        { title: '가져온 2', body: '둘' },
      ],
      status: 'draft',
      versionSource: 'import',
    })
    expect(created.map((c) => c.position)).toEqual([3, 4])
    expect(created.map((c) => c.title)).toEqual(['가져온 1', '가져온 2'])
    const versions = await listVersions(db, actor, created[0].id)
    expect(versions[0].source).toBe('import')
  })
})

describe('getLatestPosition', () => {
  it('is the largest non-archived position, 0 when empty', async () => {
    const { actor, work } = await setup()
    expect(await getLatestPosition(db, work.id)).toBe(0)
    await createChapter(db, actor, { workId: work.id })
    const second = await createChapter(db, actor, { workId: work.id })
    expect(await getLatestPosition(db, work.id)).toBe(2)
    await archiveChapter(db, actor, second.id)
    expect(await getLatestPosition(db, work.id)).toBe(1)
  })
})

describe('chapter_versions rows', () => {
  it('are stored per chapter', async () => {
    const { actor, work } = await setup()
    const chapter = await createChapter(db, actor, { workId: work.id })
    const rows = await db
      .select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapter.id))
    expect(rows).toHaveLength(1)
  })
})
