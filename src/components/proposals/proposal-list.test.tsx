// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { bulkApproveAction } from '@/server/actions/proposals'
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

  it('shows an empty state when nothing is waiting', () => {
    render(<ProposalList proposals={[]} workId="work-1" chapters={chapters} grouping="entity" />)
    expect(screen.getByText('승인 대기 중인 제안이 없습니다.')).toBeInTheDocument()
  })
})
