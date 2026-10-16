import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { AppError } from '@/lib/errors'
import { getMembership, hasRole, requireRowWork, requireWorkRole, ROLE_RANK } from './access'

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

describe('role ranks', () => {
  it('orders viewer < commenter < editor < owner', () => {
    expect(ROLE_RANK).toEqual({ viewer: 0, commenter: 1, editor: 2, owner: 3 })
    expect(hasRole('owner', 'editor')).toBe(true)
    expect(hasRole('editor', 'editor')).toBe(true)
    expect(hasRole('viewer', 'editor')).toBe(false)
  })
})

describe('requireWorkRole', () => {
  it('lets the owner pass an editor check', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await expect(requireWorkRole(db, work.id, owner.id, 'editor')).resolves.toEqual({
      role: 'owner',
    })
  })

  it('returns the membership role from getMembership', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await expect(getMembership(db, work.id, owner.id)).resolves.toEqual({ role: 'owner' })
  })

  it('rejects a viewer who requires editor with FORBIDDEN', async () => {
    const owner = await createTestUser(db)
    const viewer = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expectAppError(requireWorkRole(db, work.id, viewer.id, 'editor'), 'FORBIDDEN')
    await expect(requireWorkRole(db, work.id, viewer.id, 'viewer')).resolves.toEqual({
      role: 'viewer',
    })
  })

  it('hides a work from a stranger with NOT_FOUND', async () => {
    const owner = await createTestUser(db)
    const stranger = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await expectAppError(requireWorkRole(db, work.id, stranger.id, 'viewer'), 'NOT_FOUND')
  })

  it('returns NOT_FOUND for a work that does not exist', async () => {
    const owner = await createTestUser(db)
    await expectAppError(requireWorkRole(db, randomUUID(), owner.id, 'viewer'), 'NOT_FOUND')
  })

  it('returns NOT_FOUND for a malformed work id instead of a database error', async () => {
    const owner = await createTestUser(db)
    await expectAppError(requireWorkRole(db, 'not-a-uuid', owner.id, 'viewer'), 'NOT_FOUND')
  })
})

describe('requireRowWork', () => {
  it('returns the workId of a row', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const fact = await createTestFact(db, work.id, { content: '서윤은 열일곱 살이다.' })
    await expect(requireRowWork(db, 'facts', fact.id)).resolves.toBe(work.id)
  })

  it('returns the workId of a row that is only reachable through its parent', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const chapter = await createTestChapter(db, work.id, { position: 1 })
    const entry = await createTestEntry(db, work.id, { name: '서윤' })
    await expect(requireRowWork(db, 'chapters', chapter.id)).resolves.toBe(work.id)
    await expect(requireRowWork(db, 'wiki_entries', entry.id)).resolves.toBe(work.id)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expectAppError(requireRowWork(db, 'facts', randomUUID()), 'NOT_FOUND')
    await expectAppError(requireRowWork(db, 'facts', 'nope'), 'NOT_FOUND')
  })
})
