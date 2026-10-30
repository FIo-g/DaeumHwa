import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { authorDirectives } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { DIRECTIVE_PROBES, plantLedger } from './directives'
import type { RunContext } from './run'

// Ledger planting scope (stage 2, task 8): the tic row is scoped to the character when the entry
// exists under the name or an alias, and falls back to the work otherwise.

async function plantFor(lang: 'ko' | 'en', entries: { name: string; aliases?: string[] }[]) {
  const db = await createTestDb()
  const user = await createTestUser(db)
  const work = await createTestWork(db, user.id)
  for (const entry of entries) {
    await createTestEntry(db, work.id, { name: entry.name, aliases: entry.aliases })
  }
  const ctx = { db, actor: { userId: user.id }, config: { lang } } as unknown as Pick<
    RunContext,
    'db' | 'actor' | 'config'
  >
  const planted = await plantLedger(ctx, work.id)
  const ticText = DIRECTIVE_PROBES[lang][0]?.text ?? ''
  const rows = await ctx.db
    .select()
    .from(authorDirectives)
    .where(and(eq(authorDirectives.workId, work.id), eq(authorDirectives.source, 'author')))
  const tic = rows.find((row) => row.text === ticText)
  return { planted, tic, workId: work.id, entries: rows }
}

describe('ledger tic scope', () => {
  it('scopes the tic row to the character found by name', async () => {
    const { planted, tic } = await plantFor('ko', [{ name: '도윤서' }])
    expect(tic?.scope).toBe('character')
    expect(tic?.entryId).toBeTruthy()
    expect(planted.rows.find((row) => row.id === 'tic')?.scope).toBe('character')
  })

  it('scopes the tic row to the character found by alias', async () => {
    const { tic } = await plantFor('ko', [{ name: '윤서계', aliases: ['도윤서'] }])
    expect(tic?.scope).toBe('character')
    expect(tic?.entryId).toBeTruthy()
  })

  it('scopes the tic row to the character by the English name', async () => {
    const { tic } = await plantFor('en', [{ name: 'Do Yunseo' }])
    expect(tic?.scope).toBe('character')
    expect(tic?.entryId).toBeTruthy()
  })

  it('falls back to the work when no entry has the name', async () => {
    const { tic } = await plantFor('ko', [{ name: '고르다' }, { name: '공기' }])
    expect(tic?.scope).toBe('work')
    expect(tic?.entryId ?? null).toBeNull()
  })
})
