import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { wikiEntries } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { planDraft, startDraft } from '@/server/ai-features'
import { createDirective } from '@/server/directives'
import { updateEntry } from '@/server/wiki'

// Stage 2 review fix B1: the author requests of every character chosen for the chapter reach the
// prompt, even when the context budget cuts the character's card.

const MINJUN_REQUEST = '민준은 누구에게나 반말을 쓴다.'

let db: Db
let actor: { userId: string }
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  actor = { userId: owner.id }
  workId = work.id
})

/**
 * Three always-tier characters (two fill the core, 민준 overflows it) and five named ones with big
 * cards. Core entries sit outside the budget, so the named cards alone must go over it: 민준 is
 * the last entry, so it is the first one cut.
 */
async function setupOverBudgetCast() {
  const big = '설명'.repeat(1500)
  const core = '요약'.repeat(950)
  await createTestEntry(db, workId, { name: '가람', summary: core })
  await createTestEntry(db, workId, { name: '나래', summary: core })
  // Too long for the room the two cards above leave in the core, so 민준 goes to the budgeted entries.
  const minjun = await createTestEntry(db, workId, { name: '민준', summary: '과거'.repeat(120) })
  for (const name of ['다온', '라희', '마루', '바로', '서린']) {
    await createTestEntry(db, workId, { name, summary: big })
  }
  // Always-tier entries are chosen even when the text does not name them.
  for (const name of ['가람', '나래', '민준']) {
    const [row] = await db.select().from(wikiEntries).where(eq(wikiEntries.name, name)).limit(1)
    await updateEntry(db, actor, row.id, { contextTier: 'always' })
  }
  await createDirective(db, actor, {
    workId,
    scope: 'character',
    kind: 'speech',
    text: MINJUN_REQUEST,
    entryId: minjun.id,
    speechLevel: 'banmal',
    source: 'author',
  })
}

const INSTRUCTIONS = '다온, 라희, 마루, 바로, 서린이 골목에서 만난다.'

describe('character requests survive the context budget (stage 2, B1)', () => {
  it('sends the request of an always-tier character whose card the budget cut (draft)', async () => {
    await setupOverBudgetCast()
    const client = new FakeAiClient()
    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, entryIds: [] },
      client,
    )
    await done
    const first = client.recorded[0]
    // Precondition: the card of 민준 really was cut from the wiki blocks.
    expect([...(first.promptPrefix ?? []), first.prompt].join('\n')).not.toMatch(/\] 민준 \(/)
    expect(first.promptPrefix?.join('\n')).toContain(MINJUN_REQUEST)
    expect(first.promptPrefix?.join('\n')).toContain('(말투: 반말)')
  })

  it('sends the same request in the plan call', async () => {
    await setupOverBudgetCast()
    const client = new FakeAiClient()
    await planDraft(db, actor, { workId, instructions: INSTRUCTIONS, entryIds: [] }, client)
    const first = client.recorded[0]
    expect([...(first.promptPrefix ?? []), first.prompt].join('\n')).not.toMatch(/\] 민준 \(/)
    expect(first.promptPrefix?.join('\n')).toContain(MINJUN_REQUEST)
  })
})
