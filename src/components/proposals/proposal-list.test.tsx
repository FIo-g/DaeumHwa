// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { approveProposalAction, bulkApproveAction } from '@/server/actions/proposals'
import type { ProposalView } from '@/server/proposals'
import { ProposalList } from './proposal-list'

vi.mock('@/server/actions/proposals', () => ({
  approveProposalAction: vi.fn(),
  rejectProposalAction: vi.fn(),
  bulkApproveAction: vi.fn(),
  listProposalsAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const run = vi.mocked(runAction)
const bulk = vi.mocked(bulkApproveAction)

const chapters = [
  { id: 'c1', position: 1, title: '만남' },
  { id: 'c2', position: 2, title: '재회' },
]

function view(overrides: Partial<ProposalView>): ProposalView {
  return {
    id: 'p',
    workId: 'work-1',
    type: 'entry_create',
    payload: { kind: 'character', name: '이서윤', aliases: [], summary: '', fields: {} },
    status: 'pending',
    source: 'import',
    sourceRef: 'job-1',
    chapterId: 'c1',
    decidedBy: null,
    decidedAt: null,
    decisionNote: '',
    appliedTargetId: null,
    createdAt: new Date('2026-10-16T00:00:00Z'),
    chapterPosition: 1,
    chapterTitle: '만남',
    groupKey: 'name:이서윤',
    groupLabel: '이서윤',
    ...overrides,
  }
}

const entry = view({ id: 'p-entry' })
const fact = view({
  id: 'p-fact',
  type: 'fact_create',
  payload: {
    subjectName: '이서윤',
    entryId: null,
    content: '검을 쓴다',
    suggestedStatus: 'confirmed',
    sourceChapterId: 'c1',
    evidence: '',
    supersedesFactId: null,
  },
})
const minjun = view({
  id: 'p-minjun',
  chapterId: 'c2',
  chapterPosition: 2,
  chapterTitle: '재회',
  groupKey: 'name:민준',
  groupLabel: '민준',
  payload: { kind: 'character', name: '민준', aliases: [], summary: '', fields: {} },
})

beforeEach(() => {
  vi.clearAllMocks()
  bulk.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
})

afterEach(() => {
  cleanup()
})

describe('ProposalList', () => {
  it('approves a whole card group at once and removes it from the list', async () => {
    run.mockResolvedValue({ approved: 2, failed: [] } as never)
    render(
      <ProposalList
        proposals={[entry, fact, minjun]}
        workId="work-1"
        chapters={chapters}
        grouping="entity"
        selectable
      />,
    )

    const group = screen.getByRole('region', { name: '이서윤' })
    fireEvent.click(within(group).getByRole('button', { name: '이 묶음 승인' }))

    expect(bulk).toHaveBeenCalledWith({ workId: 'work-1', proposalIds: ['p-entry', 'p-fact'] })
    await waitFor(() => expect(screen.queryByRole('region', { name: '이서윤' })).toBeNull())
    expect(screen.getByRole('region', { name: '민준' })).toBeInTheDocument()
  })

  it('approves only the selected proposals', async () => {
    run.mockResolvedValue({ approved: 1, failed: [] } as never)
    render(
      <ProposalList
        proposals={[entry, minjun]}
        workId="work-1"
        chapters={chapters}
        grouping="chapter"
        selectable
      />,
    )

    // Chapter 1 sorts first, so the first checkbox belongs to the entry proposal.
    fireEvent.click(screen.getAllByRole('checkbox', { name: '이 제안 선택' })[0])
    fireEvent.click(screen.getByRole('button', { name: '선택 승인 (1)' }))

    expect(bulk).toHaveBeenCalledWith({ workId: 'work-1', proposalIds: ['p-entry'] })
    expect(run).toHaveBeenCalled()
  })

  it('renders the first page of groups and loads the rest on demand', async () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      view({
        id: `bulk-${i}`,
        groupKey: `name:인물${i}`,
        groupLabel: `인물${i}`,
        payload: { kind: 'character', name: `인물${i}`, aliases: [], summary: '', fields: {} },
      }),
    )
    run.mockResolvedValue({ approved: 20, failed: [] } as never)
    render(
      <ProposalList
        proposals={many}
        workId="work-1"
        chapters={chapters}
        grouping="entity"
        selectable
      />,
    )

    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(screen.getByText('전체 45건')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '더 보기 (남은 25묶음)' }))
    expect(screen.getAllByRole('article')).toHaveLength(40)
    fireEvent.click(screen.getByRole('button', { name: '더 보기 (남은 5묶음)' }))
    expect(screen.getAllByRole('article')).toHaveLength(45)
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull()
  })

  it('removes approved cards and keeps the load-more control consistent', async () => {
    const many = Array.from({ length: 21 }, (_, i) =>
      view({
        id: `bulk-${i}`,
        groupKey: `name:인물${i}`,
        groupLabel: `인물${i}`,
        payload: { kind: 'character', name: `인물${i}`, aliases: [], summary: '', fields: {} },
      }),
    )
    run.mockResolvedValue({ approved: 20, failed: [] } as never)
    render(
      <ProposalList
        proposals={many}
        workId="work-1"
        chapters={chapters}
        grouping="entity"
        selectable
      />,
    )

    const group = screen.getByRole('region', { name: '인물0' })
    fireEvent.click(within(group).getByRole('button', { name: '이 묶음 승인' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: '인물0' })).toBeNull())
    expect(screen.getByText('전체 20건')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(20)
  })

  it('stamps a confirmed change even when the server has already removed it from props', async () => {
    let respond: (data: unknown) => void = () => {}
    run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          respond = resolve
        }),
    )
    const props = { workId: 'work-1', chapters, grouping: 'entity' } as const
    const { rerender } = render(<ProposalList {...props} proposals={[entry, minjun]} />)
    const card = within(screen.getByRole('region', { name: '이서윤' })).getByRole('article')
    const approve = within(card).getByRole('button', { name: '승인' })
    approve.focus()
    fireEvent.click(approve)

    rerender(<ProposalList {...props} proposals={[minjun]} />)
    expect(card).toBeInTheDocument()
    expect(approve).toBeDisabled()
    await act(async () => respond({}))
    expect(card).toHaveAttribute('data-decision', 'approved')
    await waitFor(() => expect(card).not.toBeInTheDocument())
    expect(screen.getByRole('region', { name: '민준' }).contains(document.activeElement)).toBe(true)
  })

  it('keeps selected cards and edited data when an approval fails', async () => {
    const { runAction: realRun } =
      await vi.importActual<typeof import('@/lib/client/run-action')>('@/lib/client/run-action')
    run.mockImplementationOnce(realRun)
    vi.mocked(approveProposalAction).mockResolvedValueOnce({
      ok: false,
      error: { code: 'BAD_STATE', message: '이 제안을 승인할 수 없어요.' },
    })
    render(
      <ProposalList
        proposals={[entry]}
        workId="work-1"
        chapters={chapters}
        grouping="entity"
        selectable
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: '이 제안 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '새 이름' } })
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '승인' })).toBeEnabled())
    expect(toast.error).toHaveBeenCalledWith('이 제안을 승인할 수 없어요.')
    expect(screen.getByRole('article')).not.toHaveAttribute('data-decision')
    expect(screen.getByLabelText('이름')).toHaveValue('새 이름')
    expect(screen.getByRole('checkbox', { name: '이 제안 선택' })).toBeChecked()
  })

  it('keeps failed bulk approvals selected while stamping the successful ones', async () => {
    run.mockResolvedValueOnce({ approved: 1, failed: [{ proposalId: 'p-minjun' }] } as never)
    render(
      <ProposalList
        proposals={[entry, minjun]}
        workId="work-1"
        chapters={chapters}
        grouping="entity"
        selectable
      />,
    )
    const rejected = screen.getByRole('region', { name: '민준' })
    for (const checkbox of screen.getAllByRole('checkbox', { name: '이 제안 선택' })) {
      fireEvent.click(checkbox)
    }
    fireEvent.click(screen.getByRole('button', { name: '선택 승인 (2)' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: '이서윤' })).toBeNull())
    expect(within(rejected).getByRole('checkbox', { name: '이 제안 선택' })).toBeChecked()
    expect(screen.getByRole('button', { name: '선택 승인 (1)' })).toBeEnabled()
  })

  it('folds a rejected proposal before removing it', async () => {
    run.mockResolvedValueOnce({})
    render(
      <ProposalList
        proposals={[entry, minjun]}
        workId="work-1"
        chapters={chapters}
        grouping="entity"
      />,
    )
    const group = screen.getByRole('region', { name: '이서윤' })
    group.parentElement!.style.setProperty('--b-scene', '100ms')
    fireEvent.click(within(group).getByRole('button', { name: '거절' }))
    await waitFor(() =>
      expect(within(group).getByRole('article')).toHaveAttribute('data-decision', 'rejected'),
    )
    await waitFor(() => expect(group).not.toBeInTheDocument())
    expect(screen.getByRole('region', { name: '민준' })).toBeInTheDocument()
  })

  it('shows an empty state when nothing is waiting', () => {
    render(<ProposalList proposals={[]} workId="work-1" chapters={chapters} grouping="entity" />)
    expect(screen.getByText('승인 대기 중인 제안이 없어요.')).toBeInTheDocument()
  })
})
