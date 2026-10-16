// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listChangesAction, revertChangeAction } from '@/server/actions/history'
import { ChangeList, type ChangeView } from './change-list'

vi.mock('@/server/actions/history', () => ({
  revertChangeAction: vi.fn(),
  listChangesAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const revert = vi.mocked(revertChangeAction)
const list = vi.mocked(listChangesAction)

function row(overrides: Partial<ChangeView> & { id: string }): ChangeView {
  return {
    workId: 'work-1',
    targetTable: 'wiki_entries',
    targetId: 'target-1',
    action: 'update',
    before: null,
    after: null,
    proposerType: 'author',
    actorId: 'user-1',
    proposalId: null,
    revertsChangeId: null,
    summary: '카드 수정',
    createdAt: new Date('2026-10-16T05:00:00Z'),
    actorName: '작가 A',
    ...overrides,
  }
}

const aiRow = row({
  id: 'c-ai',
  proposerType: 'ai',
  targetTable: 'facts',
  summary: '새 사실 추가',
  action: 'update',
  before: { content: '검을 쓴다', status: 'assumed' },
  after: { content: '검을 쓴다', status: 'confirmed' },
})
const authorRow = row({ id: 'c-author', summary: '문체 카드 수정', targetTable: 'style_cards' })

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('ChangeList', () => {
  it('lists each change with its summary and an AI badge for AI proposals', () => {
    render(<ChangeList workId="work-1" initialRows={[aiRow, authorRow]} canEdit={false} />)
    expect(screen.getByText('새 사실 추가')).toBeInTheDocument()
    expect(screen.getByText('문체 카드 수정')).toBeInTheDocument()
    expect(screen.getAllByText('AI 제안')).toHaveLength(1)
    expect(screen.getAllByText('작가 A')).toHaveLength(2)
  })

  it('expands a row to show the changed fields', () => {
    render(<ChangeList workId="work-1" initialRows={[aiRow]} canEdit={false} />)
    expect(screen.queryByText('가정')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '자세히 보기' }))
    expect(screen.getByText('가정')).toBeInTheDocument()
    expect(screen.getByText('확정')).toBeInTheDocument()
  })

  it('hides the revert button from roles below editor', () => {
    render(<ChangeList workId="work-1" initialRows={[authorRow]} canEdit={false} />)
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
  })

  it('reverts after confirmation and reloads the first page', async () => {
    revert.mockResolvedValue({ ok: true, data: { ...authorRow, id: 'c-revert' } })
    list.mockResolvedValue({
      ok: true,
      data: [row({ id: 'c-revert', summary: '되돌리기: 문체 카드 수정' })],
    })
    render(<ChangeList workId="work-1" initialRows={[authorRow]} canEdit />)

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '되돌리기' }))

    await waitFor(() => expect(revert).toHaveBeenCalledWith({ changeId: 'c-author' }))
    await waitFor(() => expect(screen.getByText('되돌리기: 문체 카드 수정')).toBeInTheDocument())
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ workId: 'work-1' }))
  })

  it('loads the next page from the oldest loaded change', async () => {
    const page = Array.from({ length: 50 }, (_, i) =>
      row({
        id: `c-${i}`,
        summary: `변경 ${i}`,
        createdAt: new Date(Date.UTC(2026, 9, 16, 5, 0, 0) - i * 60_000),
      }),
    )
    list.mockResolvedValue({
      ok: true,
      data: [
        row({ id: 'c-old', summary: '오래된 변경', createdAt: new Date('2026-10-01T00:00:00Z') }),
      ],
    })
    render(<ChangeList workId="work-1" initialRows={page} canEdit={false} />)

    fireEvent.click(screen.getByRole('button', { name: '더 보기' }))

    await waitFor(() => expect(screen.getByText('오래된 변경')).toBeInTheDocument())
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        workId: 'work-1',
        beforeCreatedAt: page[49].createdAt.toISOString(),
      }),
    )
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument()
  })

  it('shows the empty message when there are no changes', () => {
    render(<ChangeList workId="work-1" initialRows={[]} canEdit={false} />)
    expect(screen.getByText('변경 이력이 없습니다.')).toBeInTheDocument()
  })
})
