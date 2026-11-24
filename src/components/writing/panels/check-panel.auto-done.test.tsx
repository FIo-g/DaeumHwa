// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, IssueRow, Role } from '@/db/types'
import { cancelAutoCheck, useAutoCheck } from '@/lib/client/auto-check'
import type { SelectionRange, WritingData } from '../types'
import { CheckPanel } from './check-panel'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/client/auto-check', () => ({
  useAutoCheck: vi.fn(),
  cancelAutoCheck: vi.fn(),
  startAutoCheck: vi.fn(),
}))

vi.mock('@/server/actions/issues', () => ({
  resolveIssueAction: vi.fn(),
  reopenIssueAction: vi.fn(),
}))

vi.mock('@/server/actions/proposals', () => ({
  listProposalsAction: vi.fn(),
  bulkApproveAction: vi.fn(),
  approveProposalAction: vi.fn(),
  rejectProposalAction: vi.fn(),
}))

vi.mock('@/server/actions/wiki', () => ({
  updateFactAction: vi.fn(),
  supersedeFactAction: vi.fn(),
}))

function makeData(): WritingData {
  return {
    workId: 'work-1',
    workTitle: '테스트 작품',
    role: 'editor' as Role,
    targetChars: 5500,
    chapter: {
      id: 'c1',
      workId: 'work-1',
      position: 3,
      title: '재회',
      body: '',
      status: 'draft',
      version: 1,
      archivedAt: null,
    } as unknown as ChapterRow,
    chapters: [{ id: 'c1', position: 3, title: '재회' }],
    entries: [],
    namingRules: [],
    threads: [],
    issues: [],
    comments: [],
    pendingProposalCount: 0,
  }
}

function makeApi() {
  return {
    getText: vi.fn((): string => ''),
    replaceRange: vi.fn(),
    replaceQuote: vi.fn((): boolean => true),
    appendText: vi.fn(),
    setHighlights: vi.fn(),
    focusRange: vi.fn(),
    getSelection: vi.fn((): SelectionRange | null => null),
    saveNow: vi.fn(async () => {}),
    refresh: vi.fn(),
  }
}

function makeIssue(): IssueRow {
  return {
    id: 'issue-1',
    workId: 'work-1',
    chapterId: 'c1',
    runId: null,
    kind: 'contradiction',
    severity: 'high',
    quote: '그는 왼손에 검을 쥐었다.',
    quoteStart: 0,
    quoteEnd: 13,
    entryId: null,
    factId: null,
    wikiExcerpt: '서윤은 오른손잡이다.',
    explanation: '손 방향이 위키와 다릅니다.',
    suggestion: '',
    status: 'open',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date('2026-11-03T00:00:00Z'),
  }
}

function renderPanel() {
  return render(<CheckPanel data={makeData()} api={makeApi()} text="본문" />)
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('CheckPanel auto check', () => {
  it('shows the auto check status instead of the check button while it runs', () => {
    vi.mocked(useAutoCheck).mockReturnValue({ running: true, elapsedSec: 5, result: null })

    const { rerender } = renderPanel()

    expect(screen.getByText('자동 점검 중… 5초')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '회차 점검' })).toBeNull()
    // A running check is not an empty result: the empty state waits until it finishes.
    expect(screen.getByRole('status')).toHaveTextContent('보통 15~25초 걸려요.')
    expect(screen.queryByText('열린 지적이 없어요.')).toBeNull()

    vi.mocked(useAutoCheck).mockReturnValue({ running: false, elapsedSec: 0, result: null })
    rerender(<CheckPanel data={makeData()} api={makeApi()} text="본문" />)

    expect(screen.getByRole('button', { name: '회차 점검' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    expect(
      screen.getByText('‘회차 점검’을 눌러 보세요. 설정과 어긋난 문장을 찾아 드려요.'),
    ).toBeInTheDocument()
  })

  it('shows the issues of a finished auto check before the page refreshes', () => {
    const issue = makeIssue()
    const data = makeData()
    const api = makeApi()
    vi.mocked(useAutoCheck).mockReturnValue({ running: true, elapsedSec: 3, result: null })

    const { rerender } = render(<CheckPanel data={data} api={api} text="본문" />)
    expect(screen.queryByText('열린 지적이 없어요.')).toBeNull()

    vi.mocked(useAutoCheck).mockReturnValue({
      running: false,
      elapsedSec: 0,
      result: { issues: [issue], proposals: [], runIds: [], namingIssueCount: 0 },
    })
    rerender(<CheckPanel data={data} api={api} text="본문" />)

    expect(screen.getByText(issue.quote)).toBeInTheDocument()
    expect(screen.queryByText('열린 지적이 없어요.')).toBeNull()
  })

  it('cancels the auto check from the panel', async () => {
    vi.mocked(useAutoCheck).mockReturnValue({ running: true, elapsedSec: 5, result: null })
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(cancelAutoCheck).toHaveBeenCalledWith('c1')
  })
})
