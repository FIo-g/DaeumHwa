// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pageContext: vi.fn(),
  listWorksWithStats: vi.fn(),
  getResumePoint: vi.fn(),
}))

vi.mock('@/server/page-helpers', () => ({
  pageContext: mocks.pageContext,
  guardPage: <T,>(fn: () => Promise<T>) => fn(),
}))

vi.mock('@/server/dashboard', () => ({
  listWorksWithStats: mocks.listWorksWithStats,
}))

vi.mock('@/server/user-state', () => ({
  getResumePoint: mocks.getResumePoint,
}))

vi.mock('@/server/actions/sample-work', () => ({
  createSampleWorkAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

import WorksPage from './page'

beforeEach(() => {
  mocks.pageContext.mockReset().mockResolvedValue({
    db: {},
    actor: { userId: 'user-1' },
    user: { id: 'user-1', name: '작가', email: 'writer@test.local' },
  })
  mocks.listWorksWithStats.mockReset().mockResolvedValue([])
  mocks.getResumePoint.mockReset().mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

describe('WorksPage', () => {
  it('shows exactly one sample button on the empty works page', async () => {
    render(await WorksPage())

    expect(screen.getAllByRole('button', { name: '샘플 작품으로 체험하기' })).toHaveLength(1)
  })

  it('shows only the header sample button when there is an active work', async () => {
    mocks.listWorksWithStats.mockResolvedValue([
      {
        work: {
          id: 'work-1',
          ownerId: 'user-1',
          title: '테스트 작품',
          genre: '판타지',
          logline: '',
          synopsis: '',
          settings: {},
          status: 'active',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        },
        role: 'owner',
        chapterCount: 1,
        latestPosition: 1,
        lastEditedAt: null,
        pendingCount: 0,
        openThreadCount: 0,
        alertCount: 0,
      },
    ])

    render(await WorksPage())

    const sampleButtons = screen.getAllByRole('button', { name: '샘플 작품으로 체험하기' })
    expect(sampleButtons).toHaveLength(1)
    expect(sampleButtons[0].closest('header')).not.toBeNull()
    expect(screen.queryByText('아직 작품이 없습니다')).not.toBeInTheDocument()
    expect(screen.getByText('테스트 작품')).toBeInTheDocument()
  })
})
