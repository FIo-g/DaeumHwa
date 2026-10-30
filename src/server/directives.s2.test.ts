import { eq } from 'drizzle-orm'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { aiUsageEvents, authorDirectives, changeLog, wikiEntries } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { revertChange } from '@/server/changes'
import {
  activeDirectivesFor,
  archiveDirective,
  createDirective,
  listDirectives,
  updateDirective,
} from './directives'

// Lets a test make the usage event write fail; the real recorder runs otherwise.
const usage = vi.hoisted(() => ({ fail: false }))
vi.mock('@/server/usage-events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/usage-events')>()
  return {
    ...actual,
    recordUsageEvent: async (...args: Parameters<typeof actual.recordUsageEvent>) => {
      if (usage.fail) throw new Error('usage write failed')
      return actual.recordUsageEvent(...args)
    },
  }
})

let db: Db

beforeEach(async () => {
  db = await createTestDb()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  usage.fail = false
  vi.restoreAllMocks()
})

async function expectAppError(p: Promise<unknown>, code: string, message?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  if (message !== undefined) expect((err as AppError).message).toBe(message)
}

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  return { owner, work, actor: { userId: owner.id } }
}

describe('author directives', () => {
  it('creates, updates, turns off and archives a request, one change_log row each', async () => {
    const { work, actor } = await setup()
    const row = await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'style',
      text: '대사는 짧게 쓴다',
      source: 'author',
    })
    await updateDirective(db, actor, row.id, { text: '대사는 아주 짧게 쓴다' })
    await updateDirective(db, actor, row.id, { status: 'off' })
    await archiveDirective(db, actor, row.id)

    const changes = await db.select().from(changeLog).where(eq(changeLog.targetId, row.id))
    expect(changes.map((c) => c.action).sort()).toEqual(['archive', 'create', 'update', 'update'])
    expect(changes.every((c) => c.targetTable === 'author_directives')).toBe(true)
  })

  it('lists active requests before off ones and hides archived ones unless asked', async () => {
    const { work, actor } = await setup()
    const off = await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'style',
      text: '꺼 둔 요청',
      source: 'author',
    })
    await updateDirective(db, actor, off.id, { status: 'off' })
    await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'style',
      text: '켜 둔 요청',
      source: 'author',
    })
    const gone = await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'style',
      text: '보관한 요청',
      source: 'author',
    })
    await archiveDirective(db, actor, gone.id)

    const rows = await listDirectives(db, actor, work.id)
    expect(rows.map((r) => [r.text, r.status])).toEqual([
      ['켜 둔 요청', 'active'],
      ['꺼 둔 요청', 'off'],
    ])
    const all = await listDirectives(db, actor, work.id, { includeArchived: true })
    expect(all).toHaveLength(3)
  })

  it('names the character of a character request in the list', async () => {
    const { work, actor } = await setup()
    const entry = await createTestEntry(db, work.id, { name: '이서윤' })
    await createDirective(db, actor, {
      workId: work.id,
      scope: 'character',
      kind: 'style',
      text: '차갑게 말한다',
      entryId: entry.id,
      source: 'author',
    })
    const rows = await listDirectives(db, actor, work.id)
    expect(rows.map((r) => r.entryName)).toEqual(['이서윤'])
  })

  it('rejects an update of an archived request with BAD_STATE', async () => {
    const { work, actor } = await setup()
    const row = await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'style',
      text: '짧게',
      source: 'author',
    })
    await archiveDirective(db, actor, row.id)
    await expectAppError(
      updateDirective(db, actor, row.id, { text: '길게' }),
      'BAD_STATE',
      '보관된 요청은 수정할 수 없습니다.',
    )
  })

  it('reverting the create of a request archives it', async () => {
    const { work, actor } = await setup()
    const row = await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'style',
      text: '짧게',
      source: 'author',
    })
    const [create] = await db
      .select()
      .from(changeLog)
      .where(eq(changeLog.targetId, row.id))
      .limit(1)
    await revertChange(db, actor, create.id)

    const [after] = await db.select().from(authorDirectives).where(eq(authorDirectives.id, row.id))
    expect(after.archivedAt).not.toBeNull()
  })

  it('checks each input with its Korean message', async () => {
    const { work, actor } = await setup()
    const place = await createTestEntry(db, work.id, { name: '왕궁', kind: 'place' })
    const base = { workId: work.id, text: '요청', source: 'author' as const }

    await expectAppError(
      createDirective(db, actor, { ...base, text: '   ', scope: 'work', kind: 'style' }),
      'VALIDATION',
      '요청 내용을 적어 주세요.',
    )
    await expectAppError(
      createDirective(db, actor, { ...base, text: 'a'.repeat(301), scope: 'work', kind: 'style' }),
      'VALIDATION',
      '요청은 300자까지 적을 수 있습니다.',
    )
    await expectAppError(
      createDirective(db, actor, { ...base, scope: 'character', kind: 'style' }),
      'VALIDATION',
      '인물을 골라 주세요.',
    )
    await expectAppError(
      createDirective(db, actor, {
        ...base,
        scope: 'character',
        kind: 'style',
        entryId: place.id,
      }),
      'VALIDATION',
      '인물을 골라 주세요.',
    )
    await expectAppError(
      createDirective(db, actor, { ...base, scope: 'chapter', kind: 'style' }),
      'VALIDATION',
      '몇 화에 적용할지 골라 주세요.',
    )
    await expectAppError(
      createDirective(db, actor, { ...base, scope: 'chapter', kind: 'style', chapterPosition: 0 }),
      'VALIDATION',
      '몇 화에 적용할지 골라 주세요.',
    )
    await expectAppError(
      createDirective(db, actor, { ...base, scope: 'work', kind: 'ban', pattern: '  ' }),
      'VALIDATION',
      '쓰지 않을 말을 적어 주세요.',
    )
    await expectAppError(
      createDirective(db, actor, {
        ...base,
        scope: 'work',
        kind: 'speech',
        speechLevel: 'banmal',
      }),
      'VALIDATION',
      '말투는 인물 요청에만 정할 수 있습니다.',
    )
    for (const targetChars of [null, 499, 20001]) {
      await expectAppError(
        createDirective(db, actor, { ...base, scope: 'work', kind: 'length', targetChars }),
        'VALIDATION',
        '분량은 500자에서 20,000자 사이로 적어 주세요.',
      )
    }
  })

  it('defaults a ban pattern from the text when none is given', async () => {
    const { work, actor } = await setup()
    const row = await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'ban',
      text: "'고개를 끄덕이다'는 쓰지 않는다.",
      source: 'author',
    })
    expect(row.pattern).toBe('고개를 끄덕')
  })

  it('rejects a viewer with FORBIDDEN, and a non-member with NOT_FOUND', async () => {
    const { work } = await setup()
    const viewer = await createTestUser(db)
    await addTestMember(db, work.id, viewer.id, 'viewer')
    const stranger = await createTestUser(db)
    const input = { workId: work.id, scope: 'work' as const, kind: 'style' as const, text: '짧게' }

    await expectAppError(
      createDirective(db, { userId: viewer.id }, { ...input, source: 'author' }),
      'FORBIDDEN',
    )
    await expect(listDirectives(db, { userId: viewer.id }, work.id)).resolves.toEqual([])
    await expectAppError(
      createDirective(db, { userId: stranger.id }, { ...input, source: 'author' }),
      'NOT_FOUND',
    )
    await expectAppError(listDirectives(db, { userId: stranger.id }, work.id), 'NOT_FOUND')
  })

  it('sends only the requests that apply to this chapter and its characters', async () => {
    const { work, actor } = await setup()
    const seoa = await createTestEntry(db, work.id, { name: '서윤', kind: 'character' })
    const minjun = await createTestEntry(db, work.id, { name: '민준', kind: 'character' })
    const gone = await createTestEntry(db, work.id, { name: '보관된 인물', kind: 'character' })
    const base = { workId: work.id, source: 'author' as const }

    await createDirective(db, actor, { ...base, scope: 'work', kind: 'style', text: '작품 요청' })
    await createDirective(db, actor, {
      ...base,
      scope: 'character',
      kind: 'style',
      text: '서윤 요청',
      entryId: seoa.id,
    })
    await createDirective(db, actor, {
      ...base,
      scope: 'character',
      kind: 'style',
      text: '민준 요청',
      entryId: minjun.id,
    })
    await createDirective(db, actor, {
      ...base,
      scope: 'character',
      kind: 'style',
      text: '보관된 인물 요청',
      entryId: gone.id,
    })
    await db.update(wikiEntries).set({ archivedAt: new Date() }).where(eq(wikiEntries.id, gone.id))
    await createDirective(db, actor, {
      ...base,
      scope: 'chapter',
      kind: 'style',
      text: '3화 요청',
      chapterPosition: 3,
    })
    await createDirective(db, actor, {
      ...base,
      scope: 'chapter',
      kind: 'style',
      text: '4화 요청',
      chapterPosition: 4,
    })
    const off = await createDirective(db, actor, {
      ...base,
      scope: 'work',
      kind: 'style',
      text: '꺼 둔 요청',
    })
    await updateDirective(db, actor, off.id, { status: 'off' })
    const archived = await createDirective(db, actor, {
      ...base,
      scope: 'work',
      kind: 'style',
      text: '보관된 작품 요청',
    })
    await archiveDirective(db, actor, archived.id)

    const found = await activeDirectivesFor(db, work.id, {
      position: 3,
      entryIds: [seoa.id, gone.id],
    })
    expect(found.map((d) => d.text).sort()).toEqual(['3화 요청', '서윤 요청', '작품 요청'])
    expect(found.find((d) => d.text === '서윤 요청')?.entryName).toBe('서윤')
  })

  it('records one directive_added event, and still saves when the event write fails', async () => {
    const { work, actor } = await setup()
    const row = await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'style',
      text: '짧게',
      source: 'author',
    })
    const events = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.kind, 'directive_added'))
    expect(events).toHaveLength(1)
    expect(events[0].value).toBe(1)
    expect(events[0].extra).toEqual({ author: 1 })

    usage.fail = true
    const second = await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'style',
      text: '길게',
      source: 'suggested',
    })
    const [stored] = await db
      .select()
      .from(authorDirectives)
      .where(eq(authorDirectives.id, second.id))
    expect(stored.text).toBe('길게')
    expect(row.id).not.toBe(second.id)
  })
})
