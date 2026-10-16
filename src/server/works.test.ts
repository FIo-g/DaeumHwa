import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { resolveWorkSettings } from '@/db/types'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import { AppError } from '@/lib/errors'
import { getMembership } from './access'
import { createWork, getWork, listMyWorks, setWorkArchived, updateWork } from './works'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function expectAppError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
}

describe('createWork', () => {
  it('creates the work with the caller as owner member', async () => {
    const owner = await createTestUser(db)
    const work = await createWork(
      db,
      { userId: owner.id },
      { title: '별빛 연대기', genre: '판타지' },
    )
    expect(work.title).toBe('별빛 연대기')
    expect(work.genre).toBe('판타지')
    expect(work.ownerId).toBe(owner.id)
    await expect(getMembership(db, work.id, owner.id)).resolves.toEqual({ role: 'owner' })
  })

  it('rejects an empty title with VALIDATION', async () => {
    const owner = await createTestUser(db)
    await expectAppError(createWork(db, { userId: owner.id }, { title: '   ' }), 'VALIDATION')
  })
})

describe('listMyWorks', () => {
  it('lists only my works, without archived ones by default, newest update first', async () => {
    const me = await createTestUser(db)
    const other = await createTestUser(db)
    const first = await createWork(db, { userId: me.id }, { title: '첫 작품' })
    await createWork(db, { userId: me.id }, { title: '둘째 작품' })
    const archived = await createWork(db, { userId: me.id }, { title: '보관된 작품' })
    await createTestWork(db, other.id, { title: '남의 작품' })
    await setWorkArchived(db, { userId: me.id }, archived.id, true)
    // Make the first work the most recently updated one.
    await updateWork(db, { userId: me.id }, first.id, { logline: '바뀜' })

    const visible = await listMyWorks(db, { userId: me.id })
    expect(visible.map((w) => w.title)).toEqual(['첫 작품', '둘째 작품'])
    expect(visible[0].role).toBe('owner')

    const withArchived = await listMyWorks(db, { userId: me.id }, { includeArchived: true })
    expect(withArchived.map((w) => w.title)).toContain('보관된 작품')
  })

  it('includes works where I am a member with a lower role', async () => {
    const owner = await createTestUser(db)
    const viewer = await createTestUser(db)
    const work = await createTestWork(db, owner.id, { title: '같이 보는 작품' })
    await addTestMember(db, work.id, viewer.id, 'viewer')
    const list = await listMyWorks(db, { userId: viewer.id })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ title: '같이 보는 작품', role: 'viewer' })
  })
})

describe('getWork', () => {
  it('returns the work with my role and hides it from strangers', async () => {
    const owner = await createTestUser(db)
    const stranger = await createTestUser(db)
    const work = await createTestWork(db, owner.id, { title: '작품' })
    await expect(getWork(db, { userId: owner.id }, work.id)).resolves.toMatchObject({
      id: work.id,
      role: 'owner',
    })
    await expectAppError(getWork(db, { userId: stranger.id }, work.id), 'NOT_FOUND')
  })
})

describe('updateWork', () => {
  it('shallow-merges settings and keeps the defaults for unset keys', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id, { settings: { absenceThreshold: 7 } })
    await updateWork(db, { userId: owner.id }, work.id, { settings: { bufferTarget: 3 } })
    const [row] = await listMyWorks(db, { userId: owner.id })
    expect(row.settings).toEqual({ absenceThreshold: 7, bufferTarget: 3 })
    const resolved = resolveWorkSettings(row.settings)
    expect(resolved.bufferTarget).toBe(3)
    expect(resolved.absenceThreshold).toBe(7)
    expect(resolved.targetChars).toBe(5500)
  })

  it('updates text fields', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const updated = await updateWork(db, { userId: owner.id }, work.id, {
      title: '새 제목',
      synopsis: '줄거리',
    })
    expect(updated).toMatchObject({ title: '새 제목', synopsis: '줄거리' })
  })

  it('rejects an editor with FORBIDDEN', async () => {
    const owner = await createTestUser(db)
    const editor = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await addTestMember(db, work.id, editor.id, 'editor')
    await expectAppError(
      updateWork(db, { userId: editor.id }, work.id, { title: '바꿈' }),
      'FORBIDDEN',
    )
  })
})

describe('setWorkArchived', () => {
  it('archives and restores a work (owner only)', async () => {
    const owner = await createTestUser(db)
    const editor = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await addTestMember(db, work.id, editor.id, 'editor')

    await expectAppError(setWorkArchived(db, { userId: editor.id }, work.id, true), 'FORBIDDEN')

    const archived = await setWorkArchived(db, { userId: owner.id }, work.id, true)
    expect(archived.status).toBe('archived')
    const restored = await setWorkArchived(db, { userId: owner.id }, work.id, false)
    expect(restored.status).toBe('active')
  })
})
