import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { createTestUser } from '@/test/factories'
import { getChapter, listChapters } from './chapters'
import { listChanges } from './changes'
import { listFacts } from './facts'
import { createSampleWork } from './sample-work'
import { listThreads } from './threads'
import { getWork } from './works'
import { listEntries } from './wiki'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

describe('createSampleWork', () => {
  it('builds the sample work with cards, confirmed facts, 3 chapters and 3 threads', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }

    const { workId, chapterId } = await createSampleWork(db, actor)

    const entries = await listEntries(db, actor, workId)
    expect(entries).toHaveLength(5)

    const facts = await listFacts(db, actor, workId)
    expect(facts).toHaveLength(5)
    expect(facts.every((f) => f.status === 'confirmed')).toBe(true)

    const chapters = await listChapters(db, actor, workId)
    expect(chapters.map((c) => c.position)).toEqual([1, 2, 3])

    const landing = await getChapter(db, actor, chapterId)
    expect(landing.position).toBe(3)
    expect(landing.body).toContain('윤서는 왼손에 단검을 쥐고')
    const chapter3 = chapters.find((c) => c.position === 3)
    expect(chapterId).toBe(chapter3?.id)

    const threads = await listThreads(db, actor, workId)
    expect(threads).toHaveLength(3)
    const overdue = threads.find((t) => t.title === '불 꺼진 종루')
    expect(overdue?.overdue).toBe(true)
  })

  it('records change_log for the wiki rows', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }

    const { workId } = await createSampleWork(db, actor)

    const entryChanges = await listChanges(db, actor, workId, { targetTable: 'wiki_entries' })
    expect(entryChanges.length).toBeGreaterThanOrEqual(5)
  })

  it('makes a second sample work for the same user without errors', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }

    const first = await createSampleWork(db, actor)
    const second = await createSampleWork(db, actor)

    expect(second.workId).not.toBe(first.workId)
    expect(second.chapterId).not.toBe(first.chapterId)

    const chapters = await listChapters(db, actor, second.workId)
    expect(chapters.map((c) => c.position)).toEqual([1, 2, 3])
  })

  it('lets only the creator see the work', async () => {
    const owner = await createTestUser(db)
    const other = await createTestUser(db)

    const { workId } = await createSampleWork(db, { userId: owner.id })

    await expect(getWork(db, { userId: other.id }, workId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
