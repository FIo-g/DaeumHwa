// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { approveProposalAction, rejectProposalAction } from '@/server/actions/proposals'
import type { ProposalView } from '@/server/proposals'
import { ProposalCard } from './proposal-card'

vi.mock('@/server/actions/proposals', () => ({
  approveProposalAction: vi.fn(),
  rejectProposalAction: vi.fn(),
  bulkApproveAction: vi.fn(),
  listProposalsAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const approve = vi.mocked(approveProposalAction)
const reject = vi.mocked(rejectProposalAction)

const chapters = [{ id: 'c1', position: 1, title: '만남' }]

function view(overrides: Partial<ProposalView>): ProposalView {
  return {
    id: 'p-1',
    workId: 'work-1',
    type: 'fact_create',
    payload: {
      subjectName: '이서윤',
      entryId: null,
      content: '검을 쓴다',
      suggestedStatus: 'assumed',
      sourceChapterId: 'c1',
      evidence: '검을 뽑았다',
      supersedesFactId: null,
    },
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

const entryView = view({
  id: 'p-entry',
  type: 'entry_create',
  payload: { kind: 'character', name: '이서윤', aliases: [], summary: '주인공', fields: {} },
})

beforeEach(() => {
  vi.clearAllMocks()
  run.mockResolvedValue({ proposal: {} } as never)
  approve.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
  reject.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
})

afterEach(() => {
  cleanup()
})

describe('ProposalCard', () => {
  it('shows the suggested fact status as pressed, the source chapter and the evidence', () => {
    render(<ProposalCard proposal={view({})} workId="work-1" chapters={chapters} />)

    expect(screen.getByText('AI 제안')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가정' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: '1화 만남' })).toHaveAttribute(
      'href',
      '/works/work-1/chapters/c1',
    )
    expect(screen.getByText(/검을 뽑았다/)).toBeInTheDocument()
  })

  it('approves with the status the author picked', async () => {
    const onDone = vi.fn()
    render(<ProposalCard proposal={view({})} workId="work-1" chapters={chapters} onDone={onDone} />)

    fireEvent.click(screen.getByRole('button', { name: '확정' }))
    fireEvent.click(screen.getByRole('button', { name: '승인' }))

    expect(approve).toHaveBeenCalledWith({ proposalId: 'p-1', factStatus: 'confirmed' })
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('p-1'))
  })

  it('sends the edited payload when the author changes the name of a new card', async () => {
    render(<ProposalCard proposal={entryView} workId="work-1" chapters={chapters} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '신도윤' } })
    fireEvent.click(screen.getByRole('button', { name: '승인' }))

    expect(approve).toHaveBeenCalledWith({
      proposalId: 'p-entry',
      payloadOverride: expect.objectContaining({ name: '신도윤', kind: 'character' }),
    })
  })

  it('rejects the proposal', async () => {
    const onDone = vi.fn()
    render(
      <ProposalCard proposal={entryView} workId="work-1" chapters={chapters} onDone={onDone} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '거절' }))

    expect(reject).toHaveBeenCalledWith({ proposalId: 'p-entry' })
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('p-entry'))
  })

  it('does not report the proposal as done when the action fails', async () => {
    run.mockResolvedValue(null)
    const onDone = vi.fn()
    render(
      <ProposalCard proposal={entryView} workId="work-1" chapters={chapters} onDone={onDone} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '승인' }))

    await waitFor(() => expect(run).toHaveBeenCalled())
    expect(onDone).not.toHaveBeenCalled()
  })
})
