import { beforeEach, describe, expect, it } from 'vitest'
import { buildContextPack } from '@/ai/context'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { createFact, supersedeFact } from './facts'

// Stage 2 review fix D1: a superseded locked fact keeps its reveal chapter, so the replacement
// stays hidden from drafts until that chapter.

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  const entry = await createTestEntry(db, work.id, { name: '이서윤' })
  const actor = { userId: owner.id }
  const locked = await createFact(db, actor, {
    workId: work.id,
    entryId: entry.id,
    content: '서윤은 왕녀다.',
    status: 'confirmed',
    sourceType: 'author',
    revealAtPosition: 10,
  })
  return { work, entry, actor, locked }
}

async function factsAt(workId: string, position: number): Promise<string[]> {
  const pack = await buildContextPack(db, workId, {
    text: '이서윤',
    position,
    hideUnrevealed: true,
  })
  return pack.entries.flatMap((e) => e.facts.map((f) => f.content))
}

describe('supersedeFact reveal chapter', () => {
  it('carries the old reveal chapter over to the replacement', async () => {
    const { work, actor, locked } = await setup()

    const { newFact } = await supersedeFact(db, actor, {
      factId: locked.id,
      fromPosition: 3,
      content: '서윤은 왕녀이고 왕위를 포기했다.',
      status: 'confirmed',
    })

    expect(newFact.revealAtPosition).toBe(10)
    expect(await factsAt(work.id, 4)).not.toContain('서윤은 왕녀이고 왕위를 포기했다.')
    expect(await factsAt(work.id, 10)).toContain('서윤은 왕녀이고 왕위를 포기했다.')
  })

  it('uses an explicit reveal chapter from the input, including null', async () => {
    const { actor, locked } = await setup()

    const moved = await supersedeFact(db, actor, {
      factId: locked.id,
      fromPosition: 3,
      content: '서윤은 왕녀다. (바뀜)',
      status: 'confirmed',
      revealAtPosition: 6,
    })
    expect(moved.newFact.revealAtPosition).toBe(6)
  })

  it('clears the lock when the input sets revealAtPosition to null', async () => {
    const { actor, locked } = await setup()

    const open = await supersedeFact(db, actor, {
      factId: locked.id,
      fromPosition: 3,
      content: '서윤은 왕녀다. (공개)',
      status: 'confirmed',
      revealAtPosition: null,
    })
    expect(open.newFact.revealAtPosition).toBeNull()
  })
})
