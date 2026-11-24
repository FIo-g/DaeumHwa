import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { SAMPLE_WORK, type SampleWorkData } from '@/lib/sample-work'
import { createTestDb } from '@/test/db'
import { createTestUser } from '@/test/factories'
import { getChapter, listChapters } from './chapters'
import { listChanges } from './changes'
import { listFacts } from './facts'
import { listRelations } from './relations'
import { createSampleWork } from './sample-work'
import { listThreads } from './threads'
import { getWork, listMyWorks } from './works'
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
    expect(landing.title).toBe('종루의 손짓')
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
    const relationChanges = await listChanges(db, actor, workId, { targetTable: 'relations' })
    expect(relationChanges).toHaveLength(3)
    expect(relationChanges.every((c) => c.action === 'create')).toBe(true)
  })

  it('links the cards with relations, so the graph has lines', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }

    const { workId } = await createSampleWork(db, actor)

    // Rows made in one transaction share createdAt, so compare without order.
    const relations = await listRelations(db, actor, workId)
    expect(relations).toHaveLength(3)
    expect(
      relations.map((r) => [r.sourceName, r.targetName, r.kind, r.directed, r.startPosition]),
    ).toEqual(
      expect.arrayContaining([
        ['한세린', '도윤서', '만남', false, 3],
        ['도윤서', '청해항', '출신', true, null],
        ['잿빛 종루', '청해항', '위치', true, null],
      ]),
    )
    expect(relations.every((r) => r.createdByType === 'author' && r.endPosition === null)).toBe(
      true,
    )
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

  it('leaves no work behind when a step fails', async () => {
    const owner = await createTestUser(db)
    const actor = { userId: owner.id }
    const clashing: SampleWorkData = {
      ...SAMPLE_WORK,
      entries: [
        { key: 'first', name: '중복 카드', kind: 'character', aliases: [], summary: '' },
        { key: 'second', name: '중복 카드', kind: 'character', aliases: [], summary: '' },
      ],
    }

    await expect(createSampleWork(db, actor, clashing)).rejects.toMatchObject({
      code: 'CONFLICT',
    })

    expect(await listMyWorks(db, actor)).toEqual([])
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
