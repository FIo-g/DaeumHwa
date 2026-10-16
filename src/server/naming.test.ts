import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog, namingRules } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { archiveNamingRule, createNamingRule, listNamingRules, updateNamingRule } from './naming'

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

describe('createNamingRule', () => {
  it('rejects a canonical spelling that is also listed as a wrong variant', async () => {
    const { work, actor } = await setup()
    const err = await expectAppError(
      createNamingRule(db, actor, {
        workId: work.id,
        canonical: '레이아',
        variants: ['레이야', '레이아'],
      }),
      'VALIDATION',
    )
    expect(err.message).toBe('올바른 표기는 잘못된 표기 목록에 넣을 수 없습니다.')
  })

  it('trims variants, drops empty and duplicate ones, and records a change', async () => {
    const { work, actor } = await setup()
    const rule = await createNamingRule(db, actor, {
      workId: work.id,
      canonical: '레이아',
      variants: [' 레이야 ', '', '레이야', '  ', '레이'],
      note: '주인공 이름',
    })
    expect(rule.variants).toEqual(['레이야', '레이'])
    expect(rule.note).toBe('주인공 이름')

    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, rule.id))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ targetTable: 'naming_rules', action: 'create' })
  })

  it('links the rule to an entry of the same work and rejects a foreign entry', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '레이아' })
    const rule = await createNamingRule(db, actor, {
      workId: work.id,
      canonical: '레이아',
      variants: ['레이야'],
      entryId: entry.id,
    })
    expect(rule.entryId).toBe(entry.id)

    const other = await setup()
    const foreign = await createTestEntry(db, other.work.id, { name: '외부' })
    await expectAppError(
      createNamingRule(db, actor, {
        workId: work.id,
        canonical: '외부',
        variants: [],
        entryId: foreign.id,
      }),
      'NOT_FOUND',
    )
  })

  it('rejects a viewer with FORBIDDEN', async () => {
    const { work } = await setup()
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expectAppError(
      createNamingRule(
        db,
        { userId: viewer.id },
        { workId: work.id, canonical: '가', variants: [] },
      ),
      'FORBIDDEN',
    )
  })
})

describe('updateNamingRule', () => {
  it('applies the same variant rule to the merged values', async () => {
    const { work, actor } = await setup()
    const rule = await createNamingRule(db, actor, {
      workId: work.id,
      canonical: '레이아',
      variants: ['레이야'],
    })
    await expectAppError(
      updateNamingRule(db, actor, rule.id, { variants: ['레이아'] }),
      'VALIDATION',
    )
  })

  it('records the before and after snapshots', async () => {
    const { work, actor } = await setup()
    const rule = await createNamingRule(db, actor, {
      workId: work.id,
      canonical: '레이아',
      variants: ['레이야'],
    })
    const updated = await updateNamingRule(db, actor, rule.id, { variants: ['레아', '레이야'] })
    expect(updated.variants).toEqual(['레아', '레이야'])

    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, rule.id))
    const update = changes.find((c) => c.action === 'update')
    expect((update?.before as { variants: string[] }).variants).toEqual(['레이야'])
    expect((update?.after as { variants: string[] }).variants).toEqual(['레아', '레이야'])
  })
})

describe('archiveNamingRule and listNamingRules', () => {
  it('archives without deleting the row and hides it from the default list', async () => {
    const { work, actor } = await setup()
    const rule = await createNamingRule(db, actor, {
      workId: work.id,
      canonical: '레이아',
      variants: ['레이야'],
    })
    await archiveNamingRule(db, actor, rule.id)

    const [row] = await db.select().from(namingRules).where(eq(namingRules.id, rule.id))
    expect(row).toBeDefined()
    expect(row.archivedAt).not.toBeNull()
    expect(await listNamingRules(db, actor, work.id)).toHaveLength(0)
    expect(await listNamingRules(db, actor, work.id, { includeArchived: true })).toHaveLength(1)

    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, rule.id))
    expect(changes.map((c) => c.action)).toContain('archive')
  })

  it('lists active rules by canonical name', async () => {
    const { work, actor } = await setup()
    await createNamingRule(db, actor, { workId: work.id, canonical: '서윤', variants: [] })
    await createNamingRule(db, actor, { workId: work.id, canonical: '레이아', variants: [] })
    const rules = await listNamingRules(db, actor, work.id)
    expect(rules.map((r) => r.canonical)).toEqual(['레이아', '서윤'])
  })
})
