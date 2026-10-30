import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestFact, createTestUser, createTestWork } from '@/test/factories'
import { createEntry, updateEntry } from './wiki'
import { updateFact } from './facts'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  return { work, actor: { userId: owner.id } }
}

describe('entry context tier', () => {
  it('records the tier change as one update in change_log', async () => {
    const { work, actor } = await setup()
    const entry = await createEntry(db, actor, {
      workId: work.id,
      kind: 'character',
      name: '이서윤',
    })
    expect(entry.contextTier).toBe('mention')

    const updated = await updateEntry(db, actor, entry.id, { contextTier: 'always' })
    expect(updated.contextTier).toBe('always')

    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, entry.id))
    const updates = changes.filter((c) => c.action === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      targetTable: 'wiki_entries',
      before: expect.objectContaining({ contextTier: 'mention' }),
      after: expect.objectContaining({ contextTier: 'always' }),
    })
  })

  it('keeps the tier when an update does not name it', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const updated = await updateEntry(db, actor, entry.id, { summary: '주인공' })
    expect(updated.contextTier).toBe('mention')
  })
})

describe('fact reveal chapter', () => {
  it('rejects a reveal chapter below 1 with VALIDATION', async () => {
    const { work, actor } = await setup()
    const fact = await createTestFact(db, work.id, { content: '비밀' })
    const err = await updateFact(db, actor, fact.id, { revealAtPosition: 0 }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({
      code: 'VALIDATION',
      message: '공개 회차는 1 이상으로 적어 주세요.',
    })
  })

  it('stores a valid reveal chapter and clears it with null', async () => {
    const { work, actor } = await setup()
    const fact = await createTestFact(db, work.id, { content: '비밀' })

    const set = await updateFact(db, actor, fact.id, { revealAtPosition: 5 })
    expect(set.revealAtPosition).toBe(5)

    const cleared = await updateFact(db, actor, fact.id, { revealAtPosition: null })
    expect(cleared.revealAtPosition).toBeNull()
  })
})
