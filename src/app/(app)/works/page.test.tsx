// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

function card(id: string, title: string, status: 'active' | 'archived' = 'active') {
  return {
    work: {
      id,
      ownerId: 'user-1',
      title,
      genre: '판타지',
      logline: '',
      synopsis: '',
      settings: {},
      status,
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
  }
}

describe('WorksPage', () => {
  it('shows exactly one sample button on the empty works page', async () => {
    render(await WorksPage())

    expect(screen.getAllByRole('button', { name: '샘플 작품으로 체험하기' })).toHaveLength(1)
  })

  it('hides the sample button when there is an active work', async () => {
    mocks.listWorksWithStats.mockResolvedValue([card('work-1', '테스트 작품')])

    render(await WorksPage())

    expect(screen.queryByRole('button', { name: '샘플 작품으로 체험하기' })).toBeNull()
    expect(screen.getByRole('link', { name: '새 작품' }).closest('header')).not.toBeNull()
    expect(screen.queryByText('아직 작품이 없어요')).not.toBeInTheDocument()
    expect(screen.getByText('테스트 작품')).toBeInTheDocument()
  })
  it('keeps a dense shelf and opens an archived work through its disclosure', async () => {
    const active = Array.from({ length: 12 }, (_, index) =>
      card(`active-${index}`, `작업 원고 ${index + 1}`),
    )
    mocks.listWorksWithStats.mockResolvedValue([
      ...active,
      card('archived', '지난 원고', 'archived'),
    ])
    render(await WorksPage())

    expect(screen.getAllByRole('link', { name: /작업 원고/ })).toHaveLength(12)
    expect(screen.queryByRole('link', { name: /지난 원고/ })).toBeNull()
    const archive = screen.getByRole('button', { name: '보관한 작품' })
    fireEvent.click(archive)
    expect(archive).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /지난 원고/ })).toHaveAttribute(
      'href',
      '/works/archived',
    )
    fireEvent.click(archive)
    expect(archive).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /지난 원고/ })).toBeNull()
  })

  it('shows the trial entry only while an anonymous account has no active works', async () => {
    mocks.pageContext.mockResolvedValue({
      db: {},
      actor: { userId: 'trial' },
      user: { id: 'trial', isAnonymous: true },
    })
    const { rerender } = render(await WorksPage())
    expect(screen.getByRole('button', { name: '가입 없이 체험하기' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /새 작품/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '샘플 작품으로 체험하기' })).toBeNull()

    mocks.listWorksWithStats.mockResolvedValue([card('sample', '샘플 원고')])
    mocks.getResumePoint.mockResolvedValue({
      workId: 'sample',
      workTitle: '샘플 원고',
      chapterId: 'chapter-3',
      chapterTitle: '종루의 손짓',
      chapterPosition: 3,
    })
    rerender(await WorksPage())
    expect(screen.queryByRole('button', { name: '가입 없이 체험하기' })).toBeNull()
    expect(screen.queryByRole('link', { name: /새 작품/ })).toBeNull()
    expect(screen.getByRole('link', { name: /이어서 보기/ })).toHaveAttribute(
      'href',
      '/works/sample/chapters/chapter-3',
    )
  })
})
