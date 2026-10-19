import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { proposals, threads, wikiEntries } from '@/db/schema'
import { loadKnownEntries } from '@/server/known-entries'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'

let db: Db
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  workId = work.id
})

type NewRow = {
  type: 'entry_create' | 'entry_update' | 'thread_create' | 'fact_create'
  payload: unknown
  status?: 'pending' | 'approved' | 'rejected'
  source?: 'interview' | 'post_chapter'
  chapterId?: string | null
}

async function addProposal(row: NewRow): Promise<void> {
  await db.insert(proposals).values({
    workId,
    type: row.type,
    payload: row.payload,
    status: row.status ?? 'pending',
    source: row.source ?? 'interview',
    sourceRef: null,
    chapterId: row.chapterId ?? null,
  })
}

const entryPayload = (
  name: string,
  kind: 'character' | 'place' = 'character',
  aliases: string[] = [],
) => ({
  kind,
  name,
  aliases,
  summary: '',
  fields: {},
})

describe('loadKnownEntries', () => {
  it('returns non-archived wiki entries with their aliases and kind', async () => {
    await createTestEntry(db, workId, { name: '서윤', aliases: ['윤'], kind: 'character' })
    await createTestEntry(db, workId, { name: '시계탑', kind: 'place' })
    const gone = await createTestEntry(db, workId, { name: '폐허' })
    await db.update(wikiEntries).set({ archivedAt: new Date() }).where(eq(wikiEntries.id, gone.id))

    const known = await loadKnownEntries(db, workId)
    expect(known.active.map((e) => [e.name, e.aliases, e.kind]).sort()).toEqual([
      ['서윤', ['윤'], 'character'],
      ['시계탑', [], 'place'],
    ])
  })

  it('returns pending entry_create names and pending thread_create titles, not approved or rejected ones', async () => {
    await addProposal({ type: 'entry_create', payload: entryPayload('노은하') })
    await addProposal({
      type: 'entry_create',
      payload: entryPayload('승인됨'),
      status: 'approved',
    })
    await addProposal({
      type: 'entry_create',
      payload: entryPayload('거절됨'),
      status: 'rejected',
    })
    await addProposal({
      type: 'thread_create',
      payload: { title: '멈춘 종의 비밀' },
    })
    await addProposal({
      type: 'thread_create',
      payload: { title: '버려진 떡밥' },
      status: 'rejected',
    })
    await addProposal({ type: 'fact_create', payload: { content: '무관' } })

    const known = await loadKnownEntries(db, workId)
    expect(known.pending).toEqual([{ name: '노은하', aliases: [], kind: 'character' }])
    expect(known.pendingThreadTitles).toEqual(['멈춘 종의 비밀'])
  })

  it('returns non-archived threads with their status', async () => {
    await createTestThread(db, workId, { title: '낡은 편지', status: 'developing' })
    const old = await createTestThread(db, workId, { title: '지난 떡밥' })
    await db.update(threads).set({ archivedAt: new Date() }).where(eq(threads.id, old.id))

    const known = await loadKnownEntries(db, workId)
    expect(known.threads.map((t) => [t.title, t.status])).toEqual([['낡은 편지', 'developing']])
  })

  it('leaves out pending items of the excluded chapter only', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1 })
    const other = await createTestChapter(db, workId, { position: 2 })
    await addProposal({
      type: 'entry_create',
      payload: entryPayload('회차 일호'),
      source: 'post_chapter',
      chapterId: chapter.id,
    })
    await addProposal({
      type: 'entry_create',
      payload: entryPayload('회차 이호'),
      source: 'post_chapter',
      chapterId: other.id,
    })
    await addProposal({
      type: 'thread_create',
      payload: { title: '일호 떡밥' },
      source: 'post_chapter',
      chapterId: chapter.id,
    })

    const known = await loadKnownEntries(db, workId, { excludePostChapterOf: chapter.id })
    expect(known.pending.map((p) => p.name)).toEqual(['회차 이호'])
    expect(known.pendingThreadTitles).toEqual([])
  })
})

describe('loadKnownEntries speech', () => {
  it('returns the speech of active entries, empty when none', async () => {
    await createTestEntry(db, workId, { name: '서윤', fields: { speech: '반말' } })
    await createTestEntry(db, workId, { name: '민준' })

    const known = await loadKnownEntries(db, workId)
    const speech = Object.fromEntries(known.active.map((e) => [e.name, e.speech]))
    expect(speech).toEqual({ 서윤: '반말', 민준: '' })
  })

  it('reports a pending speech update by entry id, and only that', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await addProposal({
      type: 'entry_update',
      payload: { entryId: seoyun.id, entryName: '서윤', patch: { fields: { speech: '존댓말' } } },
    })
    await addProposal({
      type: 'entry_update',
      payload: { entryId: seoyun.id, entryName: '서윤', patch: { aliases: ['윤'] } },
    })

    const known = await loadKnownEntries(db, workId)
    expect(known.pendingSpeechEntryIds).toEqual([seoyun.id])
    expect(known.pending).toEqual([])
    expect(known.pendingThreadTitles).not.toContain(undefined)
    expect(known.pendingThreadTitles).toEqual([])
  })
})
