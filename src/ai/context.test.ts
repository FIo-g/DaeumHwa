import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, namingRules, relations, wikiEntries } from '@/db/schema'
import { buildContextPack, renderContextPack, resolveRefs } from '@/ai/context'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestFact,
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

async function addChapter(position: number, summary = '', title = '') {
  const [row] = await db
    .insert(chapters)
    .values({ workId, position, title, summary, body: '' })
    .returning()
  return row
}

describe('buildContextPack', () => {
  it('selects a mentioned entry and gives it ref E1', async () => {
    await createTestEntry(db, workId, { name: '이서윤', aliases: ['서윤'], summary: '주인공' })
    await createTestEntry(db, workId, { name: '민준', summary: '조연' })

    const pack = await buildContextPack(db, workId, { text: '서윤은 웃었다.', position: 3 })

    expect(pack.entries.map((e) => [e.ref, e.name])).toEqual([['E1', '이서윤']])
    expect(pack.entries[0].mentionCount).toBe(1)
    expect(pack.stats.totalEntries).toBe(2)
    expect(pack.stats.selectedEntries).toBe(1)
  })

  it('excludes archived entries', async () => {
    const entry = await createTestEntry(db, workId, { name: '이서윤' })
    await db.update(wikiEntries).set({ archivedAt: new Date() }).where(eq(wikiEntries.id, entry.id))
    const pack = await buildContextPack(db, workId, { text: '이서윤은 웃었다.', position: 1 })
    expect(pack.entries).toEqual([])
    expect(pack.stats.totalEntries).toBe(0)
  })

  it('includes extra entry ids after the mentioned ones', async () => {
    await createTestEntry(db, workId, { name: '이서윤' })
    const extra = await createTestEntry(db, workId, { name: '민준' })
    const pack = await buildContextPack(db, workId, {
      text: '이서윤은 웃었다.',
      position: 1,
      extraEntryIds: [extra.id],
    })
    expect(pack.entries.map((e) => [e.ref, e.name])).toEqual([
      ['E1', '이서윤'],
      ['E2', '민준'],
    ])
  })

  it('drops a fact valid only to position 11 at position 12', async () => {
    const entry = await createTestEntry(db, workId, { name: '이서윤' })
    await createTestFact(db, workId, {
      entryId: entry.id,
      content: '열한 화까지만 유효한 사실',
      validToPosition: 11,
    })
    await createTestFact(db, workId, { entryId: entry.id, content: '항상 유효한 사실' })

    const at12 = await buildContextPack(db, workId, { text: '이서윤', position: 12 })
    expect(at12.entries[0].facts.map((f) => f.content)).toEqual(['항상 유효한 사실'])

    const at11 = await buildContextPack(db, workId, { text: '이서윤', position: 11 })
    expect(at11.entries[0].facts.map((f) => f.content).sort()).toEqual(
      ['열한 화까지만 유효한 사실', '항상 유효한 사실'].sort(),
    )
  })

  it('ranks facts confirmed, then assumed, then undecided', async () => {
    const entry = await createTestEntry(db, workId, { name: '이서윤' })
    await createTestFact(db, workId, { entryId: entry.id, content: '미정', status: 'undecided' })
    await createTestFact(db, workId, { entryId: entry.id, content: '가정', status: 'assumed' })
    await createTestFact(db, workId, { entryId: entry.id, content: '확정', status: 'confirmed' })
    const pack = await buildContextPack(db, workId, { text: '이서윤', position: 1 })
    expect(pack.entries[0].facts.map((f) => f.status)).toEqual([
      'confirmed',
      'assumed',
      'undecided',
    ])
  })

  it('drops the lowest-ranked entries first when over budget', async () => {
    await createTestEntry(db, workId, { name: '이서윤', aliases: ['서윤'], summary: '주인공' })
    await createTestEntry(db, workId, { name: '민준', summary: '가'.repeat(600) })
    const pack = await buildContextPack(db, workId, {
      text: '서윤은 웃었다. 서윤은 떠났다. 서윤은 돌아왔다. 민준은 울었다.',
      position: 1,
      budgetChars: 500,
    })
    expect(pack.entries.map((e) => e.name)).toEqual(['이서윤'])
    expect(pack.entries[0].ref).toBe('E1')
    expect(pack.stats.selectedEntries).toBe(1)
    expect(pack.stats.approxChars).toBeLessThanOrEqual(500)
  })

  it('excludes threads planted after the position and keeps planned ones', async () => {
    const early = await addChapter(1, '', '1화')
    const late = await addChapter(5, '', '5화')
    await createTestThread(db, workId, {
      title: '초반 떡밥',
      status: 'planted',
      plantedChapterId: early.id,
    })
    await createTestThread(db, workId, {
      title: '후반 떡밥',
      status: 'planted',
      plantedChapterId: late.id,
    })
    await createTestThread(db, workId, { title: '계획 떡밥', status: 'planned' })
    await createTestThread(db, workId, {
      title: '회수된 떡밥',
      status: 'resolved',
      plantedChapterId: early.id,
    })

    const pack = await buildContextPack(db, workId, { text: '', position: 3 })
    expect(pack.threads.map((t) => t.title).sort()).toEqual(['계획 떡밥', '초반 떡밥'].sort())
    expect(pack.threads.every((t) => /^T\d+$/.test(t.ref))).toBe(true)
  })

  it('includes relations only between selected entries and valid at the position', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '이서윤' })
    const minjun = await createTestEntry(db, workId, { name: '민준' })
    const other = await createTestEntry(db, workId, { name: '지나' })
    await db.insert(relations).values([
      {
        workId,
        sourceEntryId: seoyun.id,
        targetEntryId: minjun.id,
        kind: '연인',
        startPosition: 5,
      },
      { workId, sourceEntryId: seoyun.id, targetEntryId: other.id, kind: '적대' },
    ])

    const before = await buildContextPack(db, workId, { text: '이서윤과 민준', position: 3 })
    expect(before.relations).toEqual([])

    const after = await buildContextPack(db, workId, { text: '이서윤과 민준', position: 6 })
    expect(after.relations).toEqual([
      { sourceName: '이서윤', targetName: '민준', kind: '연인', description: '' },
    ])
  })

  it('returns the two chapter summaries before the position in order', async () => {
    await addChapter(1, '일 요약')
    await addChapter(2, '이 요약')
    await addChapter(3, '삼 요약')
    await addChapter(4, '사 요약')
    const pack = await buildContextPack(db, workId, { text: '', position: 4 })
    expect(pack.previousSummaries.map((s) => [s.position, s.summary])).toEqual([
      [2, '이 요약'],
      [3, '삼 요약'],
    ])
  })

  it('prints previous chapter titles without repeating a leading episode number', async () => {
    await addChapter(2, '이 요약', '2화')
    await addChapter(3, '삼 요약', '3화 재회')
    const pack = await buildContextPack(db, workId, { text: '', position: 4 })
    const text = renderContextPack(pack)
    expect(text).toContain('- 2화: 이 요약')
    expect(text).toContain('- 3화 재회: 삼 요약')
    expect(text).not.toContain('2화 2화')
  })

  it('includes active naming rules', async () => {
    await db
      .insert(namingRules)
      .values({ workId, canonical: '이서윤', variants: ['서윤이', '이서운'] })
    const pack = await buildContextPack(db, workId, { text: '', position: 1 })
    expect(pack.namingRules).toEqual([{ canonical: '이서윤', variants: ['서윤이', '이서운'] }])
  })

  it('gives facts refs F1 onward in output order and resolves them', async () => {
    const entry = await createTestEntry(db, workId, { name: '이서윤' })
    const source = await createTestChapter(db, workId, { position: 5 })
    await createTestFact(db, workId, {
      entryId: entry.id,
      content: '첫 사실',
      sourceChapterId: source.id,
      validFromPosition: 12,
    })
    const pack = await buildContextPack(db, workId, { text: '이서윤', position: 12 })
    const fact = pack.entries[0].facts[0]
    expect(fact.ref).toBe('F1')
    expect(fact.sourcePosition).toBe(5)
    expect(fact.validFromPosition).toBe(12)

    const refs = resolveRefs(pack)
    expect(refs.entries.get('E1')?.name).toBe('이서윤')
    expect(refs.facts.get('F1')).toMatchObject({ id: fact.id, entryId: entry.id })
  })
})

describe('renderContextPack', () => {
  it('is byte-identical across two calls', async () => {
    const entry = await createTestEntry(db, workId, { name: '이서윤', aliases: ['서윤'] })
    await createTestFact(db, workId, { entryId: entry.id, content: '검은 머리' })
    await createTestThread(db, workId, { title: '비밀 편지', status: 'planned' })
    await addChapter(1, '첫 요약')
    const first = renderContextPack(
      await buildContextPack(db, workId, { text: '서윤은 웃었다.', position: 2 }),
    )
    const second = renderContextPack(
      await buildContextPack(db, workId, { text: '서윤은 웃었다.', position: 2 }),
    )
    expect(second).toBe(first)
  })

  it('renders fact status labels and validity ranges', async () => {
    const entry = await createTestEntry(db, workId, { name: '이서윤' })
    const source = await createTestChapter(db, workId, { position: 5 })
    await createTestFact(db, workId, {
      entryId: entry.id,
      content: '검은 머리',
      status: 'assumed',
      sourceChapterId: source.id,
      validFromPosition: 12,
    })
    const text = renderContextPack(
      await buildContextPack(db, workId, { text: '이서윤', position: 12 }),
    )
    expect(text).toContain('[E1] 이서윤 (인물)')
    expect(text).toContain('[F1][가정] 검은 머리 (출처 5화, 12화부터)')
    expect(text).toContain('<entries>')
    expect(text).toContain('<threads>')
    expect(text).toContain('<relations>')
    expect(text).toContain('<previous_chapters>')
    expect(text).toContain('<naming>')
  })
})
