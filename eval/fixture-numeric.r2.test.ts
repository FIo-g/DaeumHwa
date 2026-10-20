import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, beforeAll } from 'vitest'
import { buildContextPack } from '@/ai/context'
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
import { scoreIssues, scoreNotDefects } from './score'

// P13 numeric recall set (continuity-numeric). The code finds the eight readable planted errors
// through the product pack, and none of the ten trap sentences. The Korean number word error
// (열아홉 살) is only for the model. Seeds the way eval/run-continuity.ts does.

const FIXTURES = path.resolve(process.cwd(), 'eval/fixtures')
const SET = 'continuity-numeric'

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

type Answers = {
  expected: {
    chapter: number
    quoteIncludes: string
    kind: 'contradiction'
    detect: 'code' | 'model'
  }[]
  notDefects: { chapter: number; quoteIncludes: string; reason: string }[]
}

async function seed(set: string) {
  const dir = path.join(FIXTURES, set)
  const work = JSON.parse(readFileSync(path.join(dir, 'work.json'), 'utf8')) as Fixture
  const answers = JSON.parse(readFileSync(path.join(dir, 'answers.json'), 'utf8')) as Answers
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
  return { db, workId: workRow.id, work, answers, body }
}

describe('continuity-numeric fixture', () => {
  let seeded: Awaited<ReturnType<typeof seed>>
  let found: { chapter: number; quote: string; kind: 'contradiction'; hitKind?: string }[]

  beforeAll(async () => {
    seeded = await seed(SET)
    found = []
    for (const ch of seeded.work.chapters) {
      const text = seeded.body(ch.position)
      const pack = await buildContextPack(seeded.db, seeded.workId, {
        text,
        position: ch.position,
        keepNamed: true,
      })
      for (const hit of findNumericFactMismatches({ chapterText: text, pack })) {
        found.push({
          chapter: ch.position,
          quote: hit.quote,
          kind: 'contradiction',
          hitKind: hit.kind,
        })
      }
    }
  })

  it('has six chapters of 250 to 800 characters, four Korean and two English', () => {
    const { work } = seeded
    expect(work.chapters).toHaveLength(6)
    for (const ch of work.chapters) {
      const len = seeded.body(ch.position).length
      expect(len).toBeGreaterThanOrEqual(250)
      expect(len).toBeLessThanOrEqual(800)
      const korean = ch.position <= 4
      expect(/[가-힣]/.test(seeded.body(ch.position))).toBe(korean)
    }
  })

  it('lists 9 expected errors (8 code, 1 model) and 10 trap sentences, each quoted verbatim', () => {
    const { answers, work, body } = seeded
    expect(answers.expected).toHaveLength(9)
    expect(answers.expected.filter((e) => e.detect === 'code')).toHaveLength(8)
    expect(answers.expected.filter((e) => e.detect === 'model')).toHaveLength(1)
    expect(answers.notDefects).toHaveLength(10)
    for (const item of [...answers.expected, ...answers.notDefects]) {
      expect(body(item.chapter)).toContain(item.quoteIncludes)
    }
    const keys = new Set(work.entries.map((e) => e.key))
    for (const fact of work.facts) {
      expect(keys.has(fact.entry)).toBe(true)
      expect(fact.status).toBe('confirmed')
    }
  })

  it('the code finds the eight readable errors through the product pack and no trap', () => {
    const { answers } = seeded
    const codeExpected = answers.expected.filter((e) => e.detect === 'code')
    const score = scoreIssues(codeExpected, found)
    expect(score.hits).toBe(8)
    expect(score.misses).toEqual([])
    expect(score.falsePositives).toEqual([])
    expect(scoreNotDefects(answers.notDefects, found)).toEqual([])
  })

  it('does not find the Korean number word error', () => {
    const modelExpected = seeded.answers.expected.filter((e) => e.detect === 'model')
    expect(scoreIssues(modelExpected, found).hits).toBe(0)
  })

  it('reads the expected kind in each chapter', () => {
    const kinds: Record<number, string[]> = {}
    for (const hit of found) {
      kinds[hit.chapter] = [...(kinds[hit.chapter] ?? []), hit.hitKind ?? '']
    }
    expect(kinds).toEqual({
      1: ['age'],
      2: ['year'],
      3: ['floor'],
      4: ['person'],
      5: ['age', 'floor'],
      6: ['person', 'year'],
    })
  })

  it('the pre-P13 rule would have found one: the 29살 sentence only', () => {
    const ageHits = found.filter((hit) => hit.hitKind === 'age' && /\d+\s*살/.test(hit.quote))
    expect(ageHits).toHaveLength(1)
    expect(ageHits[0].quote).toContain('서하준은 29살이라 하기엔')
  })
})
