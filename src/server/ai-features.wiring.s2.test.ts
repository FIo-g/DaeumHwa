import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { facts, wikiEntries } from '@/db/schema'
import { withSceneTargets } from '@/lib/draft-plan'
import { createDirective } from '@/server/directives'
import { startDraft } from '@/server/ai-features'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'

// Stage 2 (review fix 6): wiring of the requests, the core entries and the spoiler lock into the
// draft calls. Each test reads what the fake client recorded.

const WORK_TEXT = '모든 장면에서 존댓말을 쓴다.'
const CHARACTER_TEXT = '민준은 항상 혼잣말을 한다.'
const INSTRUCTIONS = '서윤이 편지를 찾는다.'

afterEach(() => {
  vi.unstubAllEnvs()
})

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

async function setAlwaysTier(entryId: string) {
  await db.update(wikiEntries).set({ contextTier: 'always' }).where(eq(wikiEntries.id, entryId))
}

function promptPrefixText(call: { promptPrefix?: string[] }): string {
  return (call.promptPrefix ?? []).join('\n')
}

describe('draft calls carry the prefix (stage 2 review)', () => {
  it('sends promptPrefix with the requests on the continuation call of a short draft', async () => {
    await createDirective(db, actor, {
      workId,
      scope: 'work',
      kind: 'style',
      text: WORK_TEXT,
      source: 'author',
    })
    // The continuation call exists in the `continue` length mode.
    vi.stubEnv('AI_DRAFT_LENGTH_MODE', 'continue')
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => '짧은 초안이다.' } })
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5500, entryIds: [] },
      client,
    )
    await run.done
    const continuation = client.recorded.find((call) => call.name === 'draft-continue')
    expect(continuation).toBeDefined()
    expect(promptPrefixText(continuation ?? {})).toContain(`[작품 전체] ${WORK_TEXT}`)
  })

  it('sends promptPrefix with the requests on the scene calls of scenes mode', async () => {
    await createDirective(db, actor, {
      workId,
      scope: 'work',
      kind: 'style',
      text: WORK_TEXT,
      source: 'author',
    })
    const card = withSceneTargets(fakeDraftPlan(), 5000)
    const client = new FakeAiClient()
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card, mode: 'scenes' },
      client,
    )
    await run.done
    const scenes = client.recorded.filter(
      (call) => call.name === 'draft-chapter' || call.name === 'draft-scene',
    )
    expect(scenes.length).toBeGreaterThan(1)
    for (const call of scenes) {
      expect(promptPrefixText(call)).toContain(`[작품 전체] ${WORK_TEXT}`)
    }
  })

  it('puts an always-tier entry in <core_wiki> although it is not mentioned', async () => {
    const minjun = await createTestEntry(db, workId, { name: '민준' })
    await setAlwaysTier(minjun.id)

    const client = new FakeAiClient()
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, entryIds: [] },
      client,
    )
    await run.done
    const prefix = promptPrefixText(client.recorded[0])
    expect(prefix).toContain('<core_wiki>')
    expect(prefix.slice(prefix.indexOf('<core_wiki>'))).toContain('민준')
  })

  it('hides a fact revealed in a later chapter and shows it once revealed', async () => {
    await createTestChapter(db, workId, { position: 1 })
    await createTestChapter(db, workId, { position: 2 })
    await createTestChapter(db, workId, { position: 3 })
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    const secret = await createTestFact(db, workId, {
      content: '서윤의 아버지는 살아 있다.',
      entryId: seoyun.id,
    })
    await db.update(facts).set({ revealAtPosition: 5 }).where(eq(facts.id, secret.id))

    // The new chapter is position 4, before the reveal at 5.
    const early = new FakeAiClient()
    const beforeReveal = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, entryIds: [seoyun.id] },
      early,
    )
    await beforeReveal.done
    const earlyText = early.recorded.map((c) => `${promptPrefixText(c)}\n${c.prompt}`).join('\n')
    expect(earlyText).not.toContain('서윤의 아버지는 살아 있다.')

    await createTestChapter(db, workId, { position: 4 })
    const later = new FakeAiClient()
    const afterReveal = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, entryIds: [seoyun.id] },
      later,
    )
    await afterReveal.done
    const laterText = later.recorded.map((c) => `${promptPrefixText(c)}\n${c.prompt}`).join('\n')
    expect(laterText).toContain('서윤의 아버지는 살아 있다.')
  })

  it('sends the request of an always-tier character although the character is not mentioned', async () => {
    const minjun = await createTestEntry(db, workId, { name: '민준' })
    await createDirective(db, actor, {
      workId,
      scope: 'character',
      kind: 'content',
      text: CHARACTER_TEXT,
      entryId: minjun.id,
      source: 'author',
    })
    await setAlwaysTier(minjun.id)

    const client = new FakeAiClient()
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, entryIds: [] },
      client,
    )
    await run.done
    expect(promptPrefixText(client.recorded[0])).toContain(`[인물 민준] ${CHARACTER_TEXT}`)
  })
})
