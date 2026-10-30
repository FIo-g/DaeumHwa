import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { createDirective } from '@/server/directives'
import { loadWritingData } from './writing-data'

// Stage 2 review fix B3: the writing screen starts its target at the length request of the chapter.

let db: Db
let actor: { userId: string }
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  actor = { userId: owner.id }
  workId = work.id
})

describe('writing screen target follows the length request (stage 2, B3)', () => {
  it('starts the target at the chapter-scope request for that chapter only', async () => {
    const first = await createTestChapter(db, workId, { position: 1 })
    const second = await createTestChapter(db, workId, { position: 2 })
    await createDirective(db, actor, {
      workId,
      scope: 'chapter',
      kind: 'length',
      text: '이번 화는 짧게 쓴다.',
      chapterPosition: 2,
      targetChars: 3000,
      source: 'author',
    })
    const data2 = await loadWritingData(db, actor, workId, second.id)
    const data1 = await loadWritingData(db, actor, workId, first.id)
    expect(data2.targetChars).toBe(3000)
    expect(data1.targetChars).toBe(5500)
  })

  it('uses the work-scope request when the work has no chapter request', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1 })
    await createDirective(db, actor, {
      workId,
      scope: 'work',
      kind: 'length',
      text: '모든 화를 짧게 쓴다.',
      targetChars: 4000,
      source: 'author',
    })
    const data = await loadWritingData(db, actor, workId, chapter.id)
    expect(data.targetChars).toBe(4000)
  })
})
