import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { AppError } from '@/lib/errors'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'
import { previewDraftRefinement } from '@/server/draft-refine'

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

const { applyDraftRefinementAction } = await import('./ai-features')

const SHORT = '비가 내렸다. 그녀는 창가에 섰다.'
const FIVE =
  '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다. 그녀는 숨을 죽였다.'

describe('applyDraftRefinementAction', () => {
  let workId: string
  let ownerId: string

  beforeEach(async () => {
    const db = await createTestDb()
    state.db = db
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    workId = work.id
    ownerId = owner.id
    state.user = { id: owner.id, name: owner.name, email: owner.email }
  })

  /** Makes a finished draft and a candidate for it, with the same fake client for both. */
  async function previewed(text: string): Promise<{ runId: string; token: string }> {
    const db = state.db as Db
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => text } })
    const run = await startDraft(
      db,
      { userId: ownerId },
      { workId, instructions: '서윤이 편지를 발견한다.', targetChars: 10, entryIds: [] },
      client,
    )
    await run.done
    const preview = await previewDraftRefinement(
      db,
      { userId: ownerId },
      { workId, runId: run.runId },
      client,
    )
    return { runId: run.runId, token: preview.token }
  }

  it('applyDraftRefinementAction applies a stored candidate', async () => {
    const { runId, token } = await previewed(`${SHORT}\n\n${FIVE}`)

    const result = await applyDraftRefinementAction({ workId, runId, token })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({ runId, text: expect.any(String) })
    expect(result.data.text).toContain('불었다.\n\n발소리가')
  })

  it('returns VALIDATION for ids that are not uuids', async () => {
    const result = await applyDraftRefinementAction({
      workId: 'not-a-uuid',
      runId: 'x',
      token: 'token',
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('returns VALIDATION when the candidate token is missing', async () => {
    const { runId } = await previewed(`${SHORT}\n\n${FIVE}`)
    const result = await applyDraftRefinementAction({ workId, runId })
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('returns BAD_STATE when the token is not the stored candidate', async () => {
    const { runId } = await previewed(`${SHORT}\n\n${FIVE}`)
    const result = await applyDraftRefinementAction({ workId, runId, token: 'not-the-token' })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'BAD_STATE', message: '다듬기 결과가 바뀌었습니다. 다시 다듬어 주세요.' },
    })
  })

  it('returns UNAUTHENTICATED when signed out', async () => {
    state.user = null
    const result = await applyDraftRefinementAction({
      workId,
      runId: crypto.randomUUID(),
      token: 'token',
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })

  it('returns BAD_STATE when there is no candidate', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => SHORT } })
    const run = await startDraft(
      state.db as Db,
      { userId: ownerId },
      { workId, instructions: '서윤이 편지를 발견한다.', targetChars: 10, entryIds: [] },
      client,
    )
    await run.done

    const result = await applyDraftRefinementAction({
      workId,
      runId: run.runId,
      token: 'token',
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'BAD_STATE', message: '적용할 다듬기 결과가 없습니다. 다시 다듬어 주세요.' },
    })
  })
})
