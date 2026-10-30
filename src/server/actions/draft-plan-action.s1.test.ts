import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { setAiClientForTests } from '@/ai'
import { withSceneTargets } from '@/lib/draft-plan'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { AppError } from '@/lib/errors'

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as { id: string; name: string; email: string } | null,
}))

vi.mock('@/server/session', () => ({
  getSessionUser: async () => state.user,
  requireUser: async () => {
    if (!state.user) throw new AppError('UNAUTHENTICATED', '로그인이 필요합니다.')
    return state.user
  },
}))

vi.mock('@/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/client')>()),
  getDb: () => state.db as Db,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { planDraftAction } = await import('./ai-features')

describe('planDraftAction', () => {
  let workId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
  })

  afterEach(() => {
    setAiClientForTests(null)
  })

  it('refuses an empty revision note with a validation result', async () => {
    const result = await planDraftAction({
      workId,
      instructions: '',
      entryIds: [],
      revision: { card: withSceneTargets(fakeDraftPlan(), 5000), note: '' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION')
  })

  it('refuses a revision note of 301 characters with a validation result', async () => {
    const result = await planDraftAction({
      workId,
      instructions: '',
      entryIds: [],
      revision: { card: withSceneTargets(fakeDraftPlan(), 5000), note: '가'.repeat(301) },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION')
  })

  describe('card limits', () => {
    const validCard = () => withSceneTargets(fakeDraftPlan(), 5000)

    async function planWithCard(card: ReturnType<typeof validCard>) {
      return planDraftAction({
        workId,
        instructions: '',
        entryIds: [],
        revision: { card, note: '2장면을 바꿔 주세요' },
      })
    }

    function expectValidation(result: Awaited<ReturnType<typeof planWithCard>>) {
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('VALIDATION')
    }

    it('refuses a scene summary of 401 characters', async () => {
      const card = validCard()
      card.scenes[0].summary = '가'.repeat(401)
      expectValidation(await planWithCard(card))
    })

    it('refuses a scene with 13 characters', async () => {
      const card = validCard()
      card.scenes[0].characters = Array.from({ length: 13 }, (_, i) => `인물${i}`)
      expectValidation(await planWithCard(card))
    })

    it('refuses 13 threads', async () => {
      const card = validCard()
      card.threads = Array.from({ length: 13 }, (_, i) => `떡밥${i}`)
      expectValidation(await planWithCard(card))
    })

    it('refuses 9 scenes', async () => {
      const card = validCard()
      card.scenes = Array.from({ length: 9 }, () => ({ ...card.scenes[0] }))
      expectValidation(await planWithCard(card))
    })
  })

  it('accepts a revision with a valid card and a note of 2 to 300 characters', async () => {
    setAiClientForTests(new FakeAiClient())
    const result = await planDraftAction({
      workId,
      instructions: '',
      entryIds: [],
      revision: { card: withSceneTargets(fakeDraftPlan(), 5000), note: '2장면을 바꿔 주세요' },
    })
    expect(result.ok).toBe(true)
  })
})
