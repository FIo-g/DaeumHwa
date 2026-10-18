import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { chapters } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'

const STRIP_TITLE_MIGRATION = path.resolve(
  process.cwd(),
  'drizzle/0001_strip_chapter_title_prefix.sql',
)

describe('0001_strip_chapter_title_prefix', () => {
  it('removes only the chapter own number from legacy titles and keeps other titles', async () => {
    const db: Db = await createTestDb()
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const legacy: [number, string][] = [
      [1, '1화'],
      [2, '2화 재회'],
      [3, '재회'],
      [4, '12화살의 비밀'],
      [5, '제3화: 끝'],
      [6, '제6화: 끝'],
      [12, '1화 회상'],
    ]
    for (const [position, title] of legacy) {
      await createTestChapter(db, work.id, { position, title })
    }

    await db.execute(sql.raw(readFileSync(STRIP_TITLE_MIGRATION, 'utf8')))

    const rows = await db
      .select({ title: chapters.title })
      .from(chapters)
      .where(eq(chapters.workId, work.id))
      .orderBy(chapters.position)
    // 제3화 on chapter 5 and 1화 on chapter 12 are not this chapter's own number, so they stay.
    expect(rows.map((row) => row.title)).toEqual([
      '',
      '재회',
      '재회',
      '12화살의 비밀',
      '제3화: 끝',
      '끝',
      '1화 회상',
    ])
  })
})
