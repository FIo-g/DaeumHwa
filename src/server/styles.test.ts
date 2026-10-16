import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { archiveStyleCard, createStyleCard, listStyleCards, updateStyleCard } from './styles'

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

describe('style cards', () => {
  it('creates, updates and archives a card, recording a change for each', async () => {
    const { work, actor } = await setup()
    const card = await createStyleCard(db, actor, {
      workId: work.id,
      name: '서윤 대사',
      tone: '짧고 건조하다',
      rules: '물음표를 쓰지 않는다',
      examples: '"됐어."',
    })
    expect(card.name).toBe('서윤 대사')

    await updateStyleCard(db, actor, card.id, { tone: '차갑고 짧다' })
    await archiveStyleCard(db, actor, card.id)

    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, card.id))
    expect(changes.map((c) => c.action).sort()).toEqual(['archive', 'create', 'update'])
    expect(changes.every((c) => c.targetTable === 'style_cards')).toBe(true)
  })

  it('lists cards with the linked entry name, and hides archived cards', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    await createStyleCard(db, actor, { workId: work.id, entryId: entry.id, name: '서윤 대사' })
    const general = await createStyleCard(db, actor, { workId: work.id, name: '서술' })
    await createStyleCard(db, actor, { workId: work.id, name: '전투 묘사' })
    await archiveStyleCard(db, actor, general.id)

    const cards = await listStyleCards(db, actor, work.id)
    expect(cards.map((c) => [c.name, c.entryName])).toEqual([
      ['서윤 대사', '이서윤'],
      ['전투 묘사', null],
    ])
  })

  it('rejects an empty name with VALIDATION', async () => {
    const { work, actor } = await setup()
    await expectAppError(createStyleCard(db, actor, { workId: work.id, name: '  ' }), 'VALIDATION')
  })

  it('rejects a viewer with FORBIDDEN', async () => {
    const { work } = await setup()
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expectAppError(
      createStyleCard(db, { userId: viewer.id }, { workId: work.id, name: '서술' }),
      'FORBIDDEN',
    )
    await expect(listStyleCards(db, { userId: viewer.id }, work.id)).resolves.toEqual([])
  })
})
