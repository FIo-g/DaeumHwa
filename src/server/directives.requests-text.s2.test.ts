import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { wikiEntries } from '@/db/schema'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { archiveDirective, createDirective, requestsForText } from './directives'

// Stage 2 (review fixes): requestsForText picks character requests by name or alias with the
// shared mention helper, and gives a new chapter (no chapterId) the position after the latest one.

let db: Db
let actor: { userId: string }
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  actor = { userId: owner.id }
  workId = work.id
})

function characterRequest(entryId: string, text: string) {
  return createDirective(db, actor, {
    workId,
    scope: 'character',
    kind: 'content',
    text,
    entryId,
    source: 'author',
  })
}

function chapterRequest(position: number, text: string) {
  return createDirective(db, actor, {
    workId,
    scope: 'chapter',
    kind: 'content',
    text,
    chapterPosition: position,
    source: 'author',
  })
}

describe('requestsForText', () => {
  it('matches a character by name and by alias', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    const minjun = await createTestEntry(db, workId, { name: '민준', aliases: ['준호'] })
    await characterRequest(seoyun.id, '서윤은 존댓말을 쓴다.')
    await characterRequest(minjun.id, '민준은 혼잣말을 한다.')

    const byName = await requestsForText(db, workId, { chapterId: null, text: '서윤이 웃었다.' })
    expect(byName.map((r) => r.entryId)).toEqual([seoyun.id])

    const byAlias = await requestsForText(db, workId, { chapterId: null, text: '준호가 떠났다.' })
    expect(byAlias.map((r) => r.entryId)).toEqual([minjun.id])
  })

  it('does not match a name inside another word', async () => {
    const rain = await createTestEntry(db, workId, { name: '비' })
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await characterRequest(rain.id, '비는 말을 아낀다.')
    await characterRequest(seoyun.id, '서윤은 존댓말을 쓴다.')

    const found = await requestsForText(db, workId, {
      chapterId: null,
      text: '준비가 끝났다. 기서윤이 웃었다.',
    })
    expect(found).toEqual([])
  })

  it('gives nothing for an archived entry, a never entry or another work entry', async () => {
    const archived = await createTestEntry(db, workId, { name: '도윤' })
    const never = await createTestEntry(db, workId, { name: '하린' })
    await characterRequest(archived.id, '도윤은 짧게 말한다.')
    await characterRequest(never.id, '하린은 웃지 않는다.')
    await db
      .update(wikiEntries)
      .set({ archivedAt: new Date() })
      .where(eq(wikiEntries.id, archived.id))
    await db.update(wikiEntries).set({ contextTier: 'never' }).where(eq(wikiEntries.id, never.id))

    const other = await createTestUser(db)
    const otherWork = await createTestWork(db, other.id)
    const foreign = await createTestEntry(db, otherWork.id, { name: '수아' })
    await createDirective(
      db,
      { userId: other.id },
      {
        workId: otherWork.id,
        scope: 'character',
        kind: 'content',
        text: '수아는 떠난다.',
        entryId: foreign.id,
        source: 'author',
      },
    )

    const found = await requestsForText(db, workId, {
      chapterId: null,
      text: '도윤과 하린과 수아가 만났다.',
    })
    expect(found).toEqual([])
  })

  it('gives nothing after the request is archived', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    const row = await characterRequest(seoyun.id, '서윤은 존댓말을 쓴다.')
    await archiveDirective(db, actor, row.id)
    const found = await requestsForText(db, workId, { chapterId: null, text: '서윤이 웃었다.' })
    expect(found).toEqual([])
  })

  it('matches a chapter request by the chapter of chapterId', async () => {
    await createTestChapter(db, workId, { position: 1 })
    const third = await createTestChapter(db, workId, { position: 3 })
    await chapterRequest(3, '이번 화는 짧게 쓴다.')
    await chapterRequest(4, '다음 화 요청이다.')

    const found = await requestsForText(db, workId, { chapterId: third.id, text: '본문' })
    expect(found.map((r) => r.text)).toEqual(['이번 화는 짧게 쓴다.'])
  })

  it('gives a null chapterId the position after the latest chapter', async () => {
    await createTestChapter(db, workId, { position: 1 })
    await createTestChapter(db, workId, { position: 3 })
    await chapterRequest(3, '세 화 요청이다.')
    await chapterRequest(4, '새 회차 요청이다.')

    const found = await requestsForText(db, workId, { chapterId: null, text: '본문' })
    expect(found.map((r) => r.text)).toEqual(['새 회차 요청이다.'])
  })

  it('always includes work requests', async () => {
    await createDirective(db, actor, {
      workId,
      scope: 'work',
      kind: 'style',
      text: '모든 장면에서 존댓말을 쓴다.',
      source: 'author',
    })
    const found = await requestsForText(db, workId, { chapterId: null, text: '아무 말' })
    expect(found.map((r) => r.scope)).toEqual(['work'])
  })
})
