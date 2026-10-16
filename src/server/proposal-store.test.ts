import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { proposals } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { AppError } from '@/lib/errors'
import type { NewProposal } from '@/lib/proposal-payloads'
import { countPendingProposals, deletePendingProposals, insertProposals } from './proposal-store'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

const entryCreate = (name: string) => ({
  type: 'entry_create' as const,
  payload: { kind: 'character' as const, name, aliases: [], summary: '', fields: {} },
  source: 'interview' as const,
  sourceRef: null,
  chapterId: null,
})

describe('insertProposals', () => {
  it('inserts valid proposals as pending rows', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const chapter = await createTestChapter(db, work.id, { position: 1 })

    const rows = await insertProposals(db, work.id, [
      entryCreate('이서윤'),
      {
        type: 'chapter_summary',
        payload: { chapterId: chapter.id, summary: '서윤이 떠난다.' },
        source: 'post_chapter',
        sourceRef: 'run-1',
        chapterId: chapter.id,
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'pending' && r.workId === work.id)).toBe(true)
    expect(rows[1]).toMatchObject({
      type: 'chapter_summary',
      sourceRef: 'run-1',
      chapterId: chapter.id,
    })
  })

  it('rejects an invalid payload with VALIDATION and inserts nothing', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    // Deliberately invalid at runtime (unknown entry kind): the cast gets past the static type.
    const bad = {
      type: 'entry_create',
      payload: { kind: 'dragon', name: '용', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: null,
      chapterId: null,
    } as unknown as NewProposal
    const err = await insertProposals(db, work.id, [entryCreate('이서윤'), bad]).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('VALIDATION')
    expect(await countPendingProposals(db, work.id)).toBe(0)
  })

  it('rejects a chapter that belongs to another work', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const otherWork = await createTestWork(db, owner.id, { title: '다른 작품' })
    const foreign = await createTestChapter(db, otherWork.id, { position: 1 })
    const err = await insertProposals(db, work.id, [
      { ...entryCreate('이서윤'), chapterId: foreign.id },
    ]).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('NOT_FOUND')
  })
})

describe('deletePendingProposals and countPendingProposals', () => {
  it('deletes only pending proposals of the given source and chapter', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const chapterA = await createTestChapter(db, work.id, { position: 1 })
    const chapterB = await createTestChapter(db, work.id, { position: 2 })
    const summary = (chapterId: string) => ({
      type: 'chapter_summary' as const,
      payload: { chapterId, summary: '요약' },
      sourceRef: null,
    })
    const rows = await insertProposals(db, work.id, [
      { ...summary(chapterA.id), source: 'import', chapterId: chapterA.id },
      { ...summary(chapterB.id), source: 'import', chapterId: chapterB.id },
      { ...summary(chapterA.id), source: 'post_chapter', chapterId: chapterA.id },
      { ...summary(chapterA.id), source: 'import', chapterId: chapterA.id },
    ])
    // The 4th proposal is approved by hand: it must survive the delete.
    await db.update(proposals).set({ status: 'approved' }).where(eq(proposals.id, rows[3].id))

    const deleted = await deletePendingProposals(db, {
      workId: work.id,
      source: 'import',
      chapterId: chapterA.id,
    })

    expect(deleted).toBe(1)
    const remaining = await db.select().from(proposals).where(eq(proposals.workId, work.id))
    expect(remaining.map((r) => r.id).sort()).toEqual([rows[1].id, rows[2].id, rows[3].id].sort())
  })

  it('counts pending proposals only', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const rows = await insertProposals(db, work.id, [entryCreate('이서윤'), entryCreate('민준')])
    expect(await countPendingProposals(db, work.id)).toBe(2)

    await db.update(proposals).set({ status: 'approved' }).where(eq(proposals.id, rows[0].id))
    expect(await countPendingProposals(db, work.id)).toBe(1)
  })
})
