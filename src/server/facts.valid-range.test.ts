import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestFact, createTestUser, createTestWork } from '@/test/factories'
import { createFact, updateFact } from './facts'

const RANGE_START_MESSAGE = '유효 회차는 1 이상으로 적어 주세요.'
const RANGE_ORDER_MESSAGE = '끝 회차는 시작 회차보다 앞설 수 없어요.'

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
  const entry = await createTestEntry(db, work.id, { name: '이서윤' })
  return { work, entry, actor: { userId: owner.id } }
}

describe('fact valid range', () => {
  it('stores validFromPosition and keeps validToPosition open when only the start is given', async () => {
    const { work, entry, actor } = await setup()

    const created = await createFact(db, actor, {
      workId: work.id,
      entryId: entry.id,
      content: '서윤은 왕녀다.',
      status: 'confirmed',
      sourceType: 'author',
      validFromPosition: 3,
    })

    expect(created.validFromPosition).toBe(3)
    expect(created.validToPosition).toBeNull()
  })

  it('rejects a valid range below 1 with VALIDATION', async () => {
    const { work, entry, actor } = await setup()

    const err = await expectAppError(
      createFact(db, actor, {
        workId: work.id,
        entryId: entry.id,
        content: '서윤은 왕녀다.',
        status: 'confirmed',
        sourceType: 'author',
        validFromPosition: 0,
      }),
      'VALIDATION',
    )

    expect(err.message).toBe(RANGE_START_MESSAGE)
  })

  it('rejects a range whose end is before its start with VALIDATION', async () => {
    const { work, entry, actor } = await setup()

    const err = await expectAppError(
      createFact(db, actor, {
        workId: work.id,
        entryId: entry.id,
        content: '서윤은 왕녀다.',
        status: 'confirmed',
        sourceType: 'author',
        validFromPosition: 5,
        validToPosition: 2,
      }),
      'VALIDATION',
    )

    expect(err.message).toBe(RANGE_ORDER_MESSAGE)
  })

  it('checks the merged range when updateFact changes only the end', async () => {
    const { work, entry, actor } = await setup()
    const created = await createFact(db, actor, {
      workId: work.id,
      entryId: entry.id,
      content: '서윤은 왕녀다.',
      status: 'confirmed',
      sourceType: 'author',
      validFromPosition: 3,
    })

    const err = await expectAppError(
      updateFact(db, actor, created.id, { validToPosition: 1 }),
      'VALIDATION',
    )

    expect(err.message).toBe(RANGE_ORDER_MESSAGE)
  })

  it('lets a status-only update succeed even when the stored range is invalid', async () => {
    const { work, entry, actor } = await setup()
    const stored = await createTestFact(db, work.id, {
      content: '서윤은 왕녀다.',
      entryId: entry.id,
      validFromPosition: 5,
      validToPosition: 2,
    })

    const updated = await updateFact(db, actor, stored.id, { status: 'assumed' })

    expect(updated.status).toBe('assumed')
  })
})
