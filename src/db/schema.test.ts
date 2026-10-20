import { beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, facts, wikiEntries, works } from '@/db/schema'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'

const DOMAIN_TABLES = [
  'works',
  'work_members',
  'work_invites',
  'chapters',
  'chapter_versions',
  'wiki_entries',
  'entry_appearances',
  'facts',
  'threads',
  'thread_entries',
  'thread_events',
  'relations',
  'naming_rules',
  'style_cards',
  'author_directives',
  'proposals',
  'change_log',
  'issues',
  'comments',
  'interview_sessions',
  'interview_turns',
  'import_jobs',
  'schedule_items',
  'ai_runs',
  'user_work_state',
]

describe('database schema', () => {
  let db: Db

  beforeEach(async () => {
    db = await createTestDb()
  })

  it('migrations create all tables', async () => {
    const result = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    )
    const names = new Set((result.rows as { table_name: string }[]).map((r) => r.table_name))
    for (const table of DOMAIN_TABLES) {
      expect(names.has(table), `missing table ${table}`).toBe(true)
    }
    expect(names.has('user')).toBe(true)
  })

  it('uuid and defaults', async () => {
    const user = await createTestUser(db)
    const [work] = await db
      .insert(works)
      .values({ ownerId: user.id, title: '테스트 작품' })
      .returning()
    expect(work.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(work.status).toBe('active')
    expect(work.settings).toEqual({})
  })

  it('arrays and jsonb round-trip', async () => {
    const user = await createTestUser(db)
    const work = await createTestWork(db, user.id)
    const entry = await db
      .insert(wikiEntries)
      .values({
        workId: work.id,
        kind: 'character',
        name: '이서윤',
        aliases: ['서윤', '윤이'],
        fields: { age: '17' },
        customFields: [{ key: '별명', value: '서' }],
        createdByType: 'author',
      })
      .returning()
    const [read] = await db.select().from(wikiEntries).where(eq(wikiEntries.id, entry[0].id))
    expect(read.aliases).toEqual(['서윤', '윤이'])
    expect(read.fields).toEqual({ age: '17' })
    expect(read.customFields).toEqual([{ key: '별명', value: '서' }])
  })

  it('deleting a work cascades to its chapters, entries and facts', async () => {
    const user = await createTestUser(db)
    const work = await createTestWork(db, user.id)
    const chapter = await createTestChapter(db, work.id)
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    await createTestFact(db, work.id, { content: '열일곱 살이다.', entryId: entry.id })

    await db.delete(works).where(eq(works.id, work.id))

    const remainingChapters = await db.select().from(chapters).where(eq(chapters.id, chapter.id))
    const remainingEntries = await db.select().from(wikiEntries).where(eq(wikiEntries.id, entry.id))
    const remainingFacts = await db.select().from(facts).where(eq(facts.workId, work.id))
    expect(remainingChapters).toHaveLength(0)
    expect(remainingEntries).toHaveLength(0)
    expect(remainingFacts).toHaveLength(0)
  })

  it('deleting a chapter sets the fact source to null', async () => {
    const user = await createTestUser(db)
    const work = await createTestWork(db, user.id)
    const chapter = await createTestChapter(db, work.id, { position: 1 })
    const fact = await createTestFact(db, work.id, {
      content: '서윤은 검을 쓴다.',
      sourceChapterId: chapter.id,
    })
    expect(fact.sourceChapterId).toBe(chapter.id)

    await db.delete(chapters).where(eq(chapters.id, chapter.id))

    const [after] = await db.select().from(facts).where(eq(facts.id, fact.id))
    expect(after.sourceChapterId).toBeNull()
  })
})
