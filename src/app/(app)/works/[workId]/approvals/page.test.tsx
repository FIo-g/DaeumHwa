// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { countImportBatches } from '@/server/proposals'
import ApprovalsPage from './page'

vi.mock('@/server/page-helpers', () => ({
  pageContext: async () => ({ db: {}, actor: { userId: 'viewer-1' } }),
  guardPage: <T,>(fn: () => Promise<T>) => fn(),
}))
vi.mock('@/server/works', () => ({
  getWork: async () => ({ role: 'viewer' }),
}))
vi.mock('@/server/chapters', () => ({
  listChapters: async () => [],
}))
vi.mock('@/server/proposals', () => ({
  countImportBatches: vi.fn(),
  listProposals: async () => [
    {
      id: 'proposal-1',
      source: 'import',
      type: 'fact_create',
      payload: { content: '주인공은 항구를 떠났다.', evidence: '배는 아침에 출항했다.' },
      chapterPosition: 1,
      chapterTitle: '출항',
    },
  ],
}))
vi.mock('@/server/actions/proposals', () => ({
  approveProposalAction: vi.fn(),
  bulkApproveAction: vi.fn(),
  rejectProposalAction: vi.fn(),
}))

afterEach(cleanup)

it('shows the filtered read-only queue to a viewer without any decision controls', async () => {
  render(
    await ApprovalsPage({
      params: Promise.resolve({ workId: 'work-1' }),
      searchParams: Promise.resolve({ source: 'import', group: 'chapter' }),
    }),
  )

  expect(screen.getByText('승인과 거절은 편집자만 할 수 있어요.')).toBeInTheDocument()
  expect(screen.getByText('주인공은 항구를 떠났다.')).toBeInTheDocument()
  expect(screen.getByText(/배는 아침에 출항했다/)).toBeInTheDocument()
  const sources = screen.getByRole('navigation', { name: '출처' })
  expect(within(sources).getByRole('link', { name: '원고 가져오기' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  expect(within(sources).getByRole('link', { name: '전체' })).toHaveAttribute(
    'href',
    '/works/work-1/approvals?group=chapter',
  )
  expect(screen.queryByRole('button', { name: /승인|거절|수정/ })).toBeNull()
  expect(countImportBatches).not.toHaveBeenCalled()
})
