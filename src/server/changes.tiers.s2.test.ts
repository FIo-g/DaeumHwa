import { and, desc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildContextPack } from '@/ai/context'
import type { Db } from '@/db/client'
import { changeLog, facts, wikiEntries } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { revertChange } from './changes'
import { createFact, updateFact } from './facts'
import { updateEntry } from './wiki'

// Stage 2 review fix D2: undo restores contextTier and revealAtPosition, the two wiki fields
// added in stage 2.

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  const actor = { userId: owner.id }
  return { work, actor }
}

/** The newest 'update' change on a row whose `after` matches the predicate. */
async function latestUpdateWhere(
  targetId: string,
  predicate: (after: Record<string, unknown>) => boolean,
): Promise<string> {
  const rows = await db
    .select()
    .from(changeLog)
    .where(and(eq(changeLog.targetId, targetId), eq(changeLog.action, 'update')))
    .orderBy(desc(changeLog.createdAt))
  const hit = rows.find((r) => predicate(r.after as Record<string, unknown>))
  if (!hit) throw new Error('change not found')
  return hit.id
}

describe('revertChange restores the stage 2 wiki fields', () => {
  it('restores a fact reveal chapter cleared by mistake', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const fact = await createFact(db, actor, {
      workId: work.id,
      entryId: entry.id,
      content: '서윤의 비밀은 왕녀라는 것이다.',
      status: 'confirmed',
      sourceType: 'author',
      revealAtPosition: 5,
    })
    await updateFact(db, actor, fact.id, { revealAtPosition: null })
    const changeId = await latestUpdateWhere(fact.id, (after) => after.revealAtPosition === null)

    await revertChange(db, actor, changeId)

    const [row] = await db.select().from(facts).where(eq(facts.id, fact.id)).limit(1)
    expect(row.revealAtPosition).toBe(5)
    const pack = await buildContextPack(db, work.id, {
      text: '이서윤',
      position: 4,
      hideUnrevealed: true,
    })
    expect(pack.entries.flatMap((e) => e.facts)).toHaveLength(0)
  })

  it('restores an entry context tier changed to never', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    await updateEntry(db, actor, entry.id, { contextTier: 'never' })
    const changeId = await latestUpdateWhere(entry.id, (after) => after.contextTier === 'never')

    await revertChange(db, actor, changeId)

    const [row] = await db.select().from(wikiEntries).where(eq(wikiEntries.id, entry.id)).limit(1)
    expect(row.contextTier).toBe('mention')
  })

  it('restores both summary and context tier of one mixed update', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤', summary: '원래 요약' })
    await updateEntry(db, actor, entry.id, { summary: '새 요약', contextTier: 'always' })
    const changeId = await latestUpdateWhere(entry.id, (after) => after.contextTier === 'always')

    await revertChange(db, actor, changeId)

    const [row] = await db.select().from(wikiEntries).where(eq(wikiEntries.id, entry.id)).limit(1)
    expect(row.summary).toBe('원래 요약')
    expect(row.contextTier).toBe('mention')
  })
})
