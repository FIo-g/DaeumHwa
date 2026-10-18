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
  it('removes a repeated episode number from legacy titles and keeps other titles', async () => {
    const db: Db = await createTestDb()
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const titles = ['1화', '2화 재회', '재회', '12화살의 비밀', '제3화: 끝']
    for (const [index, title] of titles.entries()) {
      await createTestChapter(db, work.id, { position: index + 1, title })
    }

    await db.execute(sql.raw(readFileSync(STRIP_TITLE_MIGRATION, 'utf8')))

    const rows = await db
      .select({ title: chapters.title })
      .from(chapters)
      .where(eq(chapters.workId, work.id))
      .orderBy(chapters.position)
    expect(rows.map((row) => row.title)).toEqual(['', '재회', '재회', '12화살의 비밀', '끝'])
  })
})
