import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import type { ProposalRow } from '@/db/types'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { insertProposals } from '@/server/proposal-store'

const mocks = vi.hoisted(() => ({
  db: null as Db | null,
  userId: '' as string,
  revalidatePath: vi.fn(),
}))

vi.mock('@/db/client', () => ({ getDb: () => mocks.db }))
vi.mock('@/server/session', () => ({
  requireUser: async () => {
    if (!mocks.userId)
      throw new (await import('@/lib/errors')).AppError('UNAUTHENTICATED', '로그인이 필요합니다.')
    return { id: mocks.userId, name: '작가', email: 'a@test.local' }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  approveProposalAction,
  bulkApproveAction,
  listProposalsAction,
  rejectProposalAction,
} from './proposals'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
  mocks.db = db
  mocks.userId = ''
  mocks.revalidatePath.mockClear()
})

async function setupProposal(): Promise<{ workId: string; proposal: ProposalRow }> {
  const owner = await createTestUser(db)
  mocks.userId = owner.id
  const work = await createTestWork(db, owner.id)
  const chapter = await createTestChapter(db, work.id, { position: 1, title: '만남' })
  const [proposal] = await insertProposals(db, work.id, [
    {
      type: 'entry_create',
      payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
      source: 'import',
      sourceRef: 'job-1',
      chapterId: chapter.id,
    },
  ])
  return { workId: work.id, proposal }
}

describe('proposal actions', () => {
  it('returns UNAUTHENTICATED when signed out', async () => {
    const result = await approveProposalAction({
      proposalId: '00000000-0000-4000-8000-000000000000',
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' },
    })
  })

  it('approves a proposal, revalidates the work and returns the applied target', async () => {
    const { workId, proposal } = await setupProposal()

    const result = await approveProposalAction({ proposalId: proposal.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.proposal.status).toBe('approved')
    expect(result.data.targetId).toBeTruthy()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/works/${workId}`, 'layout')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/works')
  })

  it('returns VALIDATION for a malformed proposal id without throwing', async () => {
    await setupProposal()
    const result = await approveProposalAction({ proposalId: 'not-a-uuid' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
  })

  it('rejects a proposal and keeps the wiki unchanged', async () => {
    const { proposal } = await setupProposal()

    const result = await rejectProposalAction({ proposalId: proposal.id, note: '아님' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.status).toBe('rejected')
    expect(result.data.decisionNote).toBe('아님')
  })

  it('bulk approves by sourceRef and reports the counts', async () => {
    const { workId } = await setupProposal()

    const result = await bulkApproveAction({ workId, sourceRef: 'job-1' })

    expect(result).toEqual({ ok: true, data: { approved: 1, failed: [] } })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/works/${workId}`, 'layout')
  })

  it('returns VALIDATION when bulk approval has neither ids nor a sourceRef', async () => {
    const { workId } = await setupProposal()
    const result = await bulkApproveAction({ workId })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
  })

  it('lists pending proposals of the work', async () => {
    const { workId } = await setupProposal()

    const result = await listProposalsAction({ workId })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].groupKey).toBe('name:이서윤')
  })
})
