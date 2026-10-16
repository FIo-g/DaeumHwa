import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { wikiEntries } from '@/db/schema'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import {
  getEntryAppearances,
  getFirstAppearances,
  recomputeAppearances,
  recomputeAppearancesForEntry,
} from './appearances'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

describe('appearances', () => {
  it('counts mentions by name and alias per chapter', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤', aliases: ['서윤'] })
    const ch1 = await createTestChapter(db, work.id, {
      position: 1,
      title: '1화',
      body: '서윤은 웃었다.',
    })
    const ch2 = await createTestChapter(db, work.id, { position: 2, body: '민준이 왔다.' })

    await recomputeAppearances(db, ch1.id)
    await recomputeAppearances(db, ch2.id)

    const appearances = await getEntryAppearances(db, entry.id)
    expect(appearances).toHaveLength(1)
    expect(appearances[0]).toMatchObject({
      chapterId: ch1.id,
      position: 1,
      title: '1화',
      mentionCount: 1,
    })
  })

  it('updates rows when aliases change and recomputing the entry', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤', aliases: ['서윤'] })
    const ch1 = await createTestChapter(db, work.id, { position: 1, body: '서윤은 웃었다.' })
    await createTestChapter(db, work.id, { position: 2, body: '민준이 왔다.' })
    await recomputeAppearancesForEntry(db, entry.id)
    expect((await getEntryAppearances(db, entry.id)).map((a) => a.position)).toEqual([1])

    await db
      .update(wikiEntries)
      .set({ aliases: ['민준'] })
      .where(eq(wikiEntries.id, entry.id))
    await recomputeAppearancesForEntry(db, entry.id)

    const after = await getEntryAppearances(db, entry.id)
    expect(after).toEqual([expect.objectContaining({ position: 2, mentionCount: 1 })])
    expect(after.map((a) => a.chapterId)).not.toContain(ch1.id)
  })

  it('returns the first appearance position per entry', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤', aliases: ['서윤'] })
    const other = await createTestEntry(db, work.id, { name: '민준' })
    const ch1 = await createTestChapter(db, work.id, { position: 1, body: '서윤은 웃었다.' })
    const ch2 = await createTestChapter(db, work.id, { position: 2, body: '서윤과 민준.' })
    await recomputeAppearances(db, ch1.id)
    await recomputeAppearances(db, ch2.id)
    await recomputeAppearancesForEntry(db, other.id)

    const first = await getFirstAppearances(db, work.id)
    expect(first.get(entry.id)).toBe(1)
    expect(first.get(other.id)).toBe(2)
  })

  it('stops counting archived entries', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const chapter = await createTestChapter(db, work.id, { position: 1, body: '이서윤이 웃었다.' })
    await recomputeAppearances(db, chapter.id)
    expect(await getEntryAppearances(db, entry.id)).toHaveLength(1)

    await db.update(wikiEntries).set({ archivedAt: new Date() }).where(eq(wikiEntries.id, entry.id))
    await recomputeAppearancesForEntry(db, entry.id)
    expect(await getEntryAppearances(db, entry.id)).toEqual([])
  })
})
