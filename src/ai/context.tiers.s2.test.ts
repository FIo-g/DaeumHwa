import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { facts, wikiEntries } from '@/db/schema'
import { CORE_BUDGET_CHARS, buildContextPack, renderCoreEntries } from '@/ai/context'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestFact, createTestUser, createTestWork } from '@/test/factories'

let db: Db
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  workId = work.id
})

async function setTier(entryId: string, contextTier: 'always' | 'mention' | 'never') {
  await db.update(wikiEntries).set({ contextTier }).where(eq(wikiEntries.id, entryId))
}

describe('context tiers', () => {
  it('chooses an unmentioned always entry into entries without splitCore', async () => {
    await createTestEntry(db, workId, { name: '이서윤' })
    const always = await createTestEntry(db, workId, { name: '민준' })
    await setTier(always.id, 'always')

    const pack = await buildContextPack(db, workId, { text: '이서윤은 웃었다.', position: 1 })

    expect(pack.core).toEqual([])
    expect(pack.entries.map((e) => e.name)).toEqual(['이서윤', '민준'])
  })

  it('moves an always entry to core with splitCore', async () => {
    await createTestEntry(db, workId, { name: '이서윤' })
    const always = await createTestEntry(db, workId, { name: '민준' })
    await setTier(always.id, 'always')

    const pack = await buildContextPack(db, workId, {
      text: '이서윤은 웃었다.',
      position: 1,
      splitCore: true,
    })

    expect(pack.core.map((e) => e.name)).toEqual(['민준'])
    expect(pack.entries.map((e) => e.name)).toEqual(['이서윤'])
    expect(renderCoreEntries(pack)).toContain('[E1] 민준')
  })

  it('leaves a mentioned never entry out, and keeps it when passed as an extra id', async () => {
    const never = await createTestEntry(db, workId, { name: '이서윤' })
    await setTier(never.id, 'never')

    const plain = await buildContextPack(db, workId, { text: '이서윤은 웃었다.', position: 1 })
    expect(plain.entries).toEqual([])

    const extra = await buildContextPack(db, workId, {
      text: '이서윤은 웃었다.',
      position: 1,
      extraEntryIds: [never.id],
    })
    expect(extra.entries.map((e) => e.name)).toEqual(['이서윤'])
  })

  it('keeps core entries within CORE_BUDGET_CHARS and leaves the rest in entries', async () => {
    const summary = 'x'.repeat(1000)
    for (let i = 1; i <= 6; i++) {
      const entry = await createTestEntry(db, workId, {
        name: `인물0${i}`,
        summary,
      })
      await setTier(entry.id, 'always')
    }

    const pack = await buildContextPack(db, workId, {
      text: '',
      position: 1,
      splitCore: true,
    })

    expect(pack.core.map((e) => e.name)).toEqual(['인물01', '인물02', '인물03'])
    expect(pack.entries.map((e) => e.name)).toEqual(['인물04', '인물05', '인물06'])
    expect(renderCoreEntries(pack).length).toBeLessThanOrEqual(CORE_BUDGET_CHARS)
  })

  it('hides a fact until its reveal chapter with hideUnrevealed', async () => {
    const entry = await createTestEntry(db, workId, { name: '이서윤' })
    const fact = await createTestFact(db, workId, {
      entryId: entry.id,
      content: '다섯 화에 드러나는 비밀',
    })
    await db.update(facts).set({ revealAtPosition: 5 }).where(eq(facts.id, fact.id))

    const at4 = await buildContextPack(db, workId, {
      text: '이서윤',
      position: 4,
      hideUnrevealed: true,
    })
    expect(at4.entries[0].facts).toEqual([])

    const at5 = await buildContextPack(db, workId, {
      text: '이서윤',
      position: 5,
      hideUnrevealed: true,
    })
    expect(at5.entries[0].facts.map((f) => f.content)).toEqual(['다섯 화에 드러나는 비밀'])

    const at4Plain = await buildContextPack(db, workId, { text: '이서윤', position: 4 })
    expect(at4Plain.entries[0].facts.map((f) => f.content)).toEqual(['다섯 화에 드러나는 비밀'])
  })

  it('renders no core entries as an empty string', async () => {
    await createTestEntry(db, workId, { name: '이서윤' })
    const pack = await buildContextPack(db, workId, {
      text: '이서윤',
      position: 1,
      splitCore: true,
    })
    expect(pack.core).toEqual([])
    expect(renderCoreEntries(pack)).toBe('')
  })
})
