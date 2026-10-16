import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestChapter, createTestUser, createTestWork } from '@/test/factories'

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  sessionUser: null as null | { id: string; name: string; email: string },
}))

vi.mock('@/db/client', () => ({
  getDb: () => mocks.db,
}))

vi.mock('@/server/session', () => ({
  getSessionUser: async () => mocks.sessionUser,
}))

import { GET } from './route'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
  mocks.db = db
  mocks.sessionUser = null
})

function callGet(workId: string) {
  const request = new Request(`http://localhost/api/works/${workId}/export`)
  return GET(request, { params: Promise.resolve({ workId }) })
}

describe('GET /api/works/[workId]/export', () => {
  it('returns 401 JSON when signed out', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const response = await callGet(work.id)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '로그인이 필요합니다.' })
  })

  it('returns the backup payload for the owner', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id, { title: '백업 작품' })
    await createTestChapter(db, work.id, { position: 1, title: '1화', body: '본문입니다' })
    mocks.sessionUser = owner

    const response = await callGet(work.id)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const payload = await response.json()
    expect(payload.format).toBe('daeumhwa-backup')
    expect(payload.version).toBe(1)
    expect(payload.work.title).toBe('백업 작품')
    expect(payload.chapters).toHaveLength(1)
    expect(payload.chapters[0].body).toBe('본문입니다')
    expect(typeof payload.exportedAt).toBe('string')
  })

  it('returns 403 JSON for an editor', async () => {
    const owner = await createTestUser(db)
    const editor = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    await addTestMember(db, work.id, editor.id, 'editor')
    mocks.sessionUser = editor

    const response = await callGet(work.id)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: '이 작업을 할 권한이 없습니다.' })
  })

  it('returns 404 JSON for a non-member', async () => {
    const owner = await createTestUser(db)
    const stranger = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    mocks.sessionUser = stranger

    const response = await callGet(work.id)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: '작품을 찾을 수 없습니다.' })
  })

  it('returns 404 JSON for a malformed work id', async () => {
    const owner = await createTestUser(db)
    mocks.sessionUser = owner
    const response = await callGet('not-a-uuid')
    expect(response.status).toBe(404)
  })
})
