import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { changeLog, facts } from '@/db/schema'
import type { FactRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import {
  archiveFact,
  createFact,
  factsValidAt,
  listFacts,
  relinkFactsForEntry,
  supersedeFact,
  updateFact,
} from './facts'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function expectAppError(p: Promise<unknown>, code: string): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  return err as AppError
}

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  return { owner, work, actor: { userId: owner.id } }
}

function fact(overrides: Partial<FactRow>): FactRow {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    workId: '00000000-0000-0000-0000-000000000001',
    entryId: null,
    subjectName: '',
    content: '',
    status: 'confirmed',
    sourceType: 'author',
    sourceChapterId: null,
    evidence: '',
    validFromPosition: null,
    validToPosition: null,
    supersededByFactId: null,
    createdByType: 'author',
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('createFact', () => {
  it('resolves the entry from subjectName, keeping the subject as typed', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤', aliases: ['서윤'] })
    const created = await createFact(db, actor, {
      workId: work.id,
      subjectName: '서윤이가',
      content: '서윤은 검을 쥔다.',
      status: 'confirmed',
      sourceType: 'chapter',
    })
    expect(created.entryId).toBe(entry.id)
    expect(created.subjectName).toBe('서윤이가')
    expect(created.sourceType).toBe('chapter')
  })

  it('defaults subjectName to the entry name when only entryId is given', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const created = await createFact(db, actor, {
      workId: work.id,
      entryId: entry.id,
      content: '서윤은 왼손잡이다.',
      status: 'assumed',
      sourceType: 'author',
    })
    expect(created.entryId).toBe(entry.id)
    expect(created.subjectName).toBe('이서윤')
    expect(created.status).toBe('assumed')
  })

  it('rejects empty content with VALIDATION', async () => {
    const { work, actor } = await setup()
    const err = await expectAppError(
      createFact(db, actor, {
        workId: work.id,
        content: '  ',
        status: 'confirmed',
        sourceType: 'author',
      }),
      'VALIDATION',
    )
    expect(err.message).toBe('사실 내용을 입력하세요.')
  })

  it('rejects an entryId from another work with NOT_FOUND', async () => {
    const { work, actor } = await setup()
    const other = await setup()
    const foreign = await createTestEntry(db, other.work.id, { name: '외부인' })
    await expectAppError(
      createFact(db, actor, {
        workId: work.id,
        entryId: foreign.id,
        content: '사실',
        status: 'confirmed',
        sourceType: 'author',
      }),
      'NOT_FOUND',
    )
  })

  it('records a create change and rejects a viewer with FORBIDDEN', async () => {
    const { work, actor } = await setup()
    const created = await createFact(db, actor, {
      workId: work.id,
      content: '비밀 통로가 있다.',
      status: 'confirmed',
      sourceType: 'author',
    })
    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, created.id))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ targetTable: 'facts', action: 'create' })

    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    await expectAppError(
      createFact(
        db,
        { userId: viewer.id },
        { workId: work.id, content: '사실', status: 'confirmed', sourceType: 'author' },
      ),
      'FORBIDDEN',
    )
  })
})

describe('updateFact', () => {
  it('records the status change in change_log', async () => {
    const { work, actor } = await setup()
    const created = await createFact(db, actor, {
      workId: work.id,
      content: '서윤은 열일곱 살이다.',
      status: 'confirmed',
      sourceType: 'author',
    })
    const updated = await updateFact(db, actor, created.id, { status: 'assumed' })
    expect(updated.status).toBe('assumed')

    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, created.id))
    const update = changes.find((c) => c.action === 'update')
    expect(update).toBeDefined()
    expect((update?.before as { status: string }).status).toBe('confirmed')
    expect((update?.after as { status: string }).status).toBe('assumed')
  })
})

describe('supersedeFact', () => {
  it('ends the old fact before fromPosition and starts the new one at it', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    const old = await createFact(db, actor, {
      workId: work.id,
      entryId: entry.id,
      content: '서윤의 거처는 북쪽 성이다.',
      status: 'confirmed',
      sourceType: 'chapter',
    })

    const { oldFact, newFact } = await supersedeFact(db, actor, {
      factId: old.id,
      fromPosition: 12,
      content: '서윤의 거처는 남쪽 성이다.',
      status: 'confirmed',
    })

    expect(oldFact.validToPosition).toBe(11)
    expect(oldFact.supersededByFactId).toBe(newFact.id)
    expect(newFact.validFromPosition).toBe(12)
    expect(newFact.validToPosition).toBeNull()
    expect(newFact.entryId).toBe(entry.id)
    expect(newFact.subjectName).toBe(old.subjectName)

    const oldChanges = await db.select().from(changeLog).where(eq(changeLog.targetId, old.id))
    expect(oldChanges.map((c) => c.action).sort()).toEqual(['create', 'update'])
    const newChanges = await db.select().from(changeLog).where(eq(changeLog.targetId, newFact.id))
    expect(newChanges.map((c) => c.action)).toEqual(['create'])
  })

  it('rejects fromPosition that is not after the old validFromPosition', async () => {
    const { work, actor } = await setup()
    const old = await createTestFact(db, work.id, {
      content: '서윤은 칼을 쓴다.',
      validFromPosition: 5,
    })
    const err = await expectAppError(
      supersedeFact(db, actor, {
        factId: old.id,
        fromPosition: 5,
        content: '서윤은 활을 쓴다.',
        status: 'confirmed',
      }),
      'VALIDATION',
    )
    expect(err.message).toBe('바뀌는 회차는 기존 사실이 유효해진 회차 이후여야 합니다.')
  })
})

describe('factsValidAt', () => {
  it('excludes a fact that ended before the position and keeps an unbounded fact', () => {
    const ended = fact({ id: 'a', content: '옛 거처', validToPosition: 11 })
    const open = fact({ id: 'b', content: '새 거처', validFromPosition: 12 })
    const archived = fact({ id: 'c', content: '보관', archivedAt: new Date() })

    expect(factsValidAt([ended, open, archived], 12).map((f) => f.id)).toEqual(['b'])
    expect(factsValidAt([ended, open, archived], 11).map((f) => f.id)).toEqual(['a'])
    expect(factsValidAt([ended, open], 1).map((f) => f.id)).toEqual(['a'])
  })

  it('treats both ends of the range as inclusive', () => {
    const f = fact({ id: 'x', validFromPosition: 3, validToPosition: 5 })
    expect(factsValidAt([f], 3)).toHaveLength(1)
    expect(factsValidAt([f], 5)).toHaveLength(1)
    expect(factsValidAt([f], 6)).toHaveLength(0)
  })
})

describe('listFacts', () => {
  it('hides superseded and archived facts by default and orders active before superseded', async () => {
    const { work, actor } = await setup()
    const old = await createTestFact(db, work.id, {
      content: '옛 사실',
      status: 'confirmed',
      validFromPosition: 1,
    })
    await supersedeFact(db, actor, {
      factId: old.id,
      fromPosition: 4,
      content: '새 사실',
      status: 'assumed',
    })
    const gone = await createTestFact(db, work.id, { content: '보관된 사실' })
    await archiveFact(db, actor, gone.id)
    await createTestFact(db, work.id, { content: '미정 사실', status: 'undecided' })

    const visible = await listFacts(db, actor, work.id)
    expect(visible.map((f) => f.content)).toEqual(['새 사실', '미정 사실'])

    const withSuperseded = await listFacts(db, actor, work.id, { includeSuperseded: true })
    expect(withSuperseded.map((f) => f.content)).toEqual(['새 사실', '미정 사실', '옛 사실'])
    const oldView = withSuperseded.find((f) => f.content === '옛 사실')
    expect(oldView?.supersededBy?.content).toBe('새 사실')
    expect(oldView?.supersededBy?.validFromPosition).toBe(4)
  })
})

describe('archiveFact', () => {
  it('sets archivedAt and records an archive change', async () => {
    const { work, actor } = await setup()
    const created = await createTestFact(db, work.id, { content: '사실' })
    const archived = await archiveFact(db, actor, created.id)
    expect(archived.archivedAt).not.toBeNull()
    const [row] = await db.select().from(facts).where(eq(facts.id, created.id))
    expect(row.archivedAt).not.toBeNull()
    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, created.id))
    expect(changes.map((c) => c.action)).toContain('archive')
  })
})

describe('relinkFactsForEntry', () => {
  it('links unlinked facts whose subject is the name or an alias, and reports the count', async () => {
    const { work } = await setup()
    const byAlias = await createTestFact(db, work.id, { content: '윤이는 웃는다.' })
    await db.update(facts).set({ subjectName: '윤이가' }).where(eq(facts.id, byAlias.id))
    const unrelated = await createTestFact(db, work.id, { content: '민준은 뛴다.' })
    await db.update(facts).set({ subjectName: '민준' }).where(eq(facts.id, unrelated.id))

    const entry = await createTestEntry(db, work.id, { name: '이서윤', aliases: ['윤이'] })
    const count = await relinkFactsForEntry(db, entry)
    expect(count).toBe(1)

    const [linked] = await db.select().from(facts).where(eq(facts.id, byAlias.id))
    expect(linked.entryId).toBe(entry.id)
    const [other] = await db.select().from(facts).where(eq(facts.id, unrelated.id))
    expect(other.entryId).toBeNull()
  })

  it('does not link an already linked fact to another entry', async () => {
    const { work } = await setup()
    const first = await createTestEntry(db, work.id, { name: '이서윤' })
    const second = await createTestEntry(db, work.id, { name: '서윤', kind: 'place' })
    const linkedFact = await createTestFact(db, work.id, { content: '사실', entryId: first.id })
    await db.update(facts).set({ subjectName: '서윤' }).where(eq(facts.id, linkedFact.id))
    expect(await relinkFactsForEntry(db, second)).toBe(0)
    const [row] = await db.select().from(facts).where(eq(facts.id, linkedFact.id))
    expect(row.entryId).toBe(first.id)
  })
})

describe('chapter reference', () => {
  it('stores a source chapter from the same work', async () => {
    const { work, actor } = await setup()
    const chapter = await createTestChapter(db, work.id, { position: 2 })
    const created = await createFact(db, actor, {
      workId: work.id,
      content: '사실',
      status: 'confirmed',
      sourceType: 'chapter',
      sourceChapterId: chapter.id,
    })
    expect(created.sourceChapterId).toBe(chapter.id)
  })
})
