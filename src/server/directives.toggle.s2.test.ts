import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { authorDirectives, changeLog } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { updateEntry } from './wiki'
import { activeDirectivesFor, createDirective, updateDirective } from './directives'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  return { work, actor: { userId: owner.id } }
}

describe('updateDirective status-only patches', () => {
  it('turns a request off even when its character card is no longer a character', async () => {
    const { work, actor } = await setup()
    const serin = await createTestEntry(db, work.id, { kind: 'character', name: '세린' })
    const directive = await createDirective(db, actor, {
      workId: work.id,
      scope: 'character',
      kind: 'speech',
      text: '세린은 반말',
      entryId: serin.id,
      speechLevel: 'banmal',
      source: 'author',
    })
    await updateEntry(db, actor, serin.id, { kind: 'organization' })

    const off = await updateDirective(db, actor, directive.id, { status: 'off' })
    expect(off.status).toBe('off')
    expect(await activeDirectivesFor(db, work.id, { position: 1, entryIds: [serin.id] })).toEqual(
      [],
    )

    const logs = await db
      .select({ summary: changeLog.summary })
      .from(changeLog)
      .where(eq(changeLog.targetId, directive.id))
    expect(logs.some((log) => log.summary.startsWith('작가 요청 끔'))).toBe(true)
  })

  it('still checks a patch that changes the text of that request', async () => {
    const { work, actor } = await setup()
    const serin = await createTestEntry(db, work.id, { kind: 'character', name: '세린' })
    const directive = await createDirective(db, actor, {
      workId: work.id,
      scope: 'character',
      kind: 'speech',
      text: '세린은 반말',
      entryId: serin.id,
      speechLevel: 'banmal',
      source: 'author',
    })
    await updateEntry(db, actor, serin.id, { kind: 'organization' })

    const err = await updateDirective(db, actor, directive.id, { text: '세린은 존댓말' }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).message).toBe('인물을 골라 주세요.')
    const [row] = await db
      .select()
      .from(authorDirectives)
      .where(eq(authorDirectives.id, directive.id))
    expect(row.text).toBe('세린은 반말')
  })
})
