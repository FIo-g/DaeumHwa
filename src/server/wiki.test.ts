import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog, chapters, facts } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { revertChange } from './changes'
import { createFact } from './facts'
import {
  archiveEntry,
  createEntry,
  findEntryByName,
  getEntry,
  listEntries,
  restoreEntry,
  updateEntry,
} from './wiki'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function expectAppError(p: Promise<unknown>, code: string): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  return err as AppError
}

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  return { owner, work, actor: { userId: owner.id } }
}

describe('createEntry', () => {
  it('trims the name, drops empty and duplicate aliases, and records a change', async () => {
    const { work, actor } = await setup()
    const entry = await createEntry(db, actor, {
      workId: work.id,
      kind: 'character',
      name: ' 이서윤 ',
      aliases: ['서윤', ' 서윤 ', '이서윤', '', '윤이'],
    })
    expect(entry.name).toBe('이서윤')
    expect(entry.aliases).toEqual(['서윤', '윤이'])

    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, entry.id))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      targetTable: 'wiki_entries',
      action: 'create',
      proposerType: 'author',
      summary: "인물 '이서윤' 생성",
    })
  })

  it('rejects a second active entry of the same kind and name with CONFLICT', async () => {
    const { work, actor } = await setup()
    await createEntry(db, actor, { workId: work.id, kind: 'character', name: '이서윤' })
    await expectAppError(
      createEntry(db, actor, { workId: work.id, kind: 'character', name: '이서윤' }),
      'CONFLICT',
    )
  })

  it('rejects an empty name with VALIDATION', async () => {
    const { work, actor } = await setup()
    const err = await expectAppError(
      createEntry(db, actor, { workId: work.id, kind: 'character', name: '   ' }),
      'VALIDATION',
    )
    expect(err.message).toBe('이름을 입력하세요.')
  })

  it('links earlier unlinked facts whose subject matches the new name or an alias', async () => {
    const { work, actor } = await setup()
    const fact = await createFact(db, actor, {
      workId: work.id,
      subjectName: '서윤',
      content: '서윤은 검을 쥔다.',
      status: 'confirmed',
      sourceType: 'author',
    })
    expect(fact.entryId).toBeNull()

    const entry = await createEntry(db, actor, {
      workId: work.id,
      kind: 'character',
      name: '이서윤',
      aliases: ['서윤'],
    })
    const [linked] = await db.select().from(facts).where(eq(facts.id, fact.id))
    expect(linked.entryId).toBe(entry.id)
  })

  it('recomputes appearances from existing chapter text', async () => {
    const { work, actor } = await setup()
    await createTestChapter(db, work.id, { position: 1, body: '서윤은 웃었다.' })
    await createTestChapter(db, work.id, { position: 2, body: '민준이 왔다.' })
    const entry = await createEntry(db, actor, {
      workId: work.id,
      kind: 'character',
      name: '이서윤',
      aliases: ['서윤'],
    })
    const detail = await getEntry(db, actor, entry.id)
    expect(detail.appearances).toEqual([
      { chapterId: expect.any(String), position: 1, title: '', mentionCount: 1 },
    ])
  })

  it('rejects a viewer with FORBIDDEN', async () => {
    const { work } = await setup()
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expectAppError(
      createEntry(db, { userId: viewer.id }, { workId: work.id, kind: 'character', name: '가' }),
      'FORBIDDEN',
    )
  })
})

describe('updateEntry', () => {
  it('records an update change with before and after snapshots', async () => {
    const { work, actor } = await setup()
    const entry = await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })
    const updated = await updateEntry(db, actor, entry.id, { name: '이서윤', summary: '주인공' })
    expect(updated.name).toBe('이서윤')

    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, entry.id))
    const update = changes.find((c) => c.action === 'update')
    expect(update).toBeDefined()
    expect(update?.summary).toBe("인물 '이서윤' 수정")
    expect((update?.before as { name: string }).name).toBe('서윤')
    expect((update?.after as { name: string }).name).toBe('이서윤')
  })

  it('recomputes appearances when an alias is added', async () => {
    const { work, actor } = await setup()
    await createTestChapter(db, work.id, { position: 1, body: '서윤은 웃었다.' })
    const entry = await createEntry(db, actor, {
      workId: work.id,
      kind: 'character',
      name: '이서윤',
    })
    expect((await getEntry(db, actor, entry.id)).appearances).toHaveLength(0)

    await updateEntry(db, actor, entry.id, { aliases: ['서윤'] })
    const detail = await getEntry(db, actor, entry.id)
    expect(detail.appearances.map((a) => a.mentionCount)).toEqual([1])
  })

  it('rejects editing an archived entry with BAD_STATE', async () => {
    const { work, actor } = await setup()
    const entry = await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })
    await archiveEntry(db, actor, entry.id)
    await expectAppError(updateEntry(db, actor, entry.id, { summary: '수정' }), 'BAD_STATE')
  })

  it('rejects renaming into another active entry of the same kind with CONFLICT', async () => {
    const { work, actor } = await setup()
    await createEntry(db, actor, { workId: work.id, kind: 'character', name: '민준' })
    const entry = await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })
    await expectAppError(updateEntry(db, actor, entry.id, { name: '민준' }), 'CONFLICT')
  })

  it('returns NOT_FOUND for an id of another work', async () => {
    const { actor } = await setup()
    const other = await setup()
    const entry = await createTestEntry(db, other.work.id, { name: '외부' })
    await expectAppError(updateEntry(db, actor, entry.id, { summary: 'x' }), 'NOT_FOUND')
  })
})

describe('archiveEntry and restoreEntry', () => {
  it('archives without deleting, and restores', async () => {
    const { work, actor } = await setup()
    const entry = await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })

    const archived = await archiveEntry(db, actor, entry.id)
    expect(archived.archivedAt).not.toBeNull()
    expect(await listEntries(db, actor, work.id)).toHaveLength(0)
    expect(await listEntries(db, actor, work.id, { includeArchived: true })).toHaveLength(1)

    const restored = await restoreEntry(db, actor, entry.id)
    expect(restored.archivedAt).toBeNull()
    expect(await listEntries(db, actor, work.id)).toHaveLength(1)

    const actions = (await db.select().from(changeLog).where(eq(changeLog.targetId, entry.id)))
      .map((c) => c.action)
      .sort()
    expect(actions).toEqual(['archive', 'create', 'restore'])
  })

  it('refuses to restore when an active entry with the same kind and name exists', async () => {
    const { work, actor } = await setup()
    const entry = await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })
    await archiveEntry(db, actor, entry.id)
    await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })
    await expectAppError(restoreEntry(db, actor, entry.id), 'CONFLICT')
  })

  it('can be reverted through the change history', async () => {
    const { work, actor } = await setup()
    const entry = await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })
    const [created] = await db.select().from(changeLog).where(eq(changeLog.targetId, entry.id))
    await revertChange(db, actor, created.id)
    const [row] = await listEntries(db, actor, work.id, { includeArchived: true })
    expect(row.archivedAt).not.toBeNull()
  })
})

describe('listEntries', () => {
  it('filters by kind and matches the query against name, aliases and summary', async () => {
    const { work, actor } = await setup()
    await createTestEntry(db, work.id, { name: '이서윤', aliases: ['서윤'], summary: '주인공' })
    await createTestEntry(db, work.id, { name: '서울', kind: 'place', summary: 'Dark city' })
    await createTestEntry(db, work.id, { name: '민준', summary: '조연' })

    const byAlias = await listEntries(db, actor, work.id, { query: '서윤' })
    expect(byAlias.map((e) => e.name)).toEqual(['이서윤'])

    const bySummary = await listEntries(db, actor, work.id, { query: 'dark' })
    expect(bySummary.map((e) => e.name)).toEqual(['서울'])

    const places = await listEntries(db, actor, work.id, { kinds: ['place'] })
    expect(places.map((e) => e.name)).toEqual(['서울'])

    const all = await listEntries(db, actor, work.id)
    expect(all.map((e) => e.name)).toEqual(['민준', '서울', '이서윤'])
  })
})

describe('findEntryByName', () => {
  it('finds an entry by an alias when the name carries a particle', async () => {
    const { work } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤', aliases: ['서윤'] })
    const found = await findEntryByName(db, work.id, '서윤이가')
    expect(found?.id).toBe(entry.id)
  })

  it('ignores archived entries and returns null when nothing matches', async () => {
    const { work, actor } = await setup()
    const entry = await createEntry(db, actor, { workId: work.id, kind: 'character', name: '서윤' })
    await archiveEntry(db, actor, entry.id)
    expect(await findEntryByName(db, work.id, '서윤')).toBeNull()
  })
})

describe('getEntry', () => {
  it('returns facts whose source chapter is archived, flagged as archived', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const chapter = await createTestChapter(db, work.id, { position: 1, title: '1화' })
    await createTestFact(db, work.id, {
      content: '서윤은 검을 쥔다.',
      entryId: entry.id,
      sourceChapterId: chapter.id,
    })
    await db.update(chapters).set({ archivedAt: new Date() }).where(eq(chapters.id, chapter.id))

    const detail = await getEntry(db, actor, entry.id)
    expect(detail.role).toBe('owner')
    expect(detail.facts).toHaveLength(1)
    expect(detail.facts[0].sourceChapter).toEqual({
      id: chapter.id,
      position: 1,
      title: '1화',
      archived: true,
    })
  })

  it('returns NOT_FOUND to a stranger', async () => {
    const { work } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const stranger = await createTestUser(db)
    await expectAppError(getEntry(db, { userId: stranger.id }, entry.id), 'NOT_FOUND')
  })
})
