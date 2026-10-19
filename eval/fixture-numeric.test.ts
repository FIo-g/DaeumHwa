import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildContextPack, renderContextPack } from '@/ai/context'
import { findNumericFactMismatches } from '@/ai/numeric-facts'
import type { Db } from '@/db/client'
import type { ChapterRow } from '@/db/types'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { packCoverage } from './coverage'

// DB-backed checks (track H) on the two fixture sets: the real pack that chapter-check builds
// (keepNamed on) must give the numeric hits and the card coverage the eval expects.
// Seeds the way eval/run-continuity.ts does (entries, facts with validity, chapters); threads and
// naming rules do not affect the numeric check or the card coverage, so they are not seeded.

const FIXTURES = path.resolve(process.cwd(), 'eval/fixtures')

type Fixture = {
  title: string
  chapters: { position: number; title: string }[]
  entries: {
    key: string
    name: string
    kind: Parameters<typeof createTestEntry>[2]['kind']
    aliases: string[]
    summary: string
  }[]
  facts: {
    entry: string
    content: string
    status: Parameters<typeof createTestFact>[2]['status']
    sourceChapter: number | null
    validFromPosition: number | null
    validToPosition: number | null
  }[]
}

async function seed(set: string) {
  const dir = path.join(FIXTURES, set)
  const work = JSON.parse(readFileSync(path.join(dir, 'work.json'), 'utf8')) as Fixture
  const db: Db = await createTestDb()
  const owner = await createTestUser(db)
  const workRow = await createTestWork(db, owner.id, { title: work.title })

  const bodies = new Map<number, string>()
  const chapterRows = new Map<number, ChapterRow>()
  for (const ch of work.chapters) {
    const body = readFileSync(
      path.join(dir, 'chapters', `${String(ch.position).padStart(2, '0')}.md`),
      'utf8',
    ).trim()
    bodies.set(ch.position, body)
    chapterRows.set(
      ch.position,
      await createTestChapter(db, workRow.id, {
        position: ch.position,
        title: ch.title,
        body,
        status: 'draft',
      }),
    )
  }

  const entryIds = new Map<string, string>()
  for (const e of work.entries) {
    const row = await createTestEntry(db, workRow.id, {
      name: e.name,
      kind: e.kind,
      aliases: e.aliases,
      summary: e.summary,
    })
    entryIds.set(e.key, row.id)
  }
  for (const f of work.facts) {
    await createTestFact(db, workRow.id, {
      content: f.content,
      entryId: entryIds.get(f.entry) ?? null,
      status: f.status,
      sourceChapterId:
        f.sourceChapter === null ? null : (chapterRows.get(f.sourceChapter)?.id ?? null),
      validFromPosition: f.validFromPosition,
      validToPosition: f.validToPosition,
    })
  }

  const body = (position: number) => bodies.get(position) ?? ''
  return { db, workId: workRow.id, work, body }
}

describe('continuity fixture through the product pack', () => {
  it('gives no numeric hit on chapter 7, where the age change is explained', async () => {
    const { db, workId, body } = await seed('continuity')
    const text = body(7)
    const pack = await buildContextPack(db, workId, { text, position: 7, keepNamed: true })
    expect(findNumericFactMismatches({ chapterText: text, pack })).toEqual([])
  })

  it('gives exactly one numeric hit on chapter 10 (27살 wiki, 25살 manuscript)', async () => {
    const { db, workId, body } = await seed('continuity')
    const text = body(10)
    const pack = await buildContextPack(db, workId, { text, position: 10, keepNamed: true })
    const hits = findNumericFactMismatches({ chapterText: text, pack })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ wikiValue: 27, foundValue: 25 })
    expect(hits[0].quote).toBe('옆에서 25살의 도윤서는 말없이 고개를 끄덕였다.')
  })
})

describe('continuity-planted through the product pack', () => {
  it('puts the compound-only lighthouse card in the pack when keepNamed is on', async () => {
    const { db, workId, work, body } = await seed('continuity-planted')
    const text = body(3)
    const cards = work.entries.map((e) => ({ name: e.name, aliases: e.aliases }))

    const withNamed = await buildContextPack(db, workId, { text, position: 3, keepNamed: true })
    expect(packCoverage(text, cards, renderContextPack(withNamed)).rate).toBe(1)

    const withoutNamed = await buildContextPack(db, workId, { text, position: 3 })
    expect(packCoverage(text, cards, renderContextPack(withoutNamed)).rate).toBeLessThan(1)
  })
})
