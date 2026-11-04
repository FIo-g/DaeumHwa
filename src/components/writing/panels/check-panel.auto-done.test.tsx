// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
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
    vi.mocked(useAutoCheck).mockReturnValue({ running: true, elapsedSec: 5 })

    const { rerender } = renderPanel()

    expect(screen.getByText('자동 점검 중… 5초')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '회차 점검' })).toBeNull()
    expect(
      screen.getByText(
        '회차 점검을 누르거나 회차를 완료로 바꾸면 설정과 어긋나는 문장을 찾아 줍니다.',
      ),
    ).toBeInTheDocument()

    vi.mocked(useAutoCheck).mockReturnValue({ running: false, elapsedSec: 0 })
    rerender(<CheckPanel data={makeData()} api={makeApi()} text="본문" />)

    expect(screen.getByRole('button', { name: '회차 점검' })).toBeInTheDocument()
  })

  it('cancels the auto check from the panel', async () => {
    vi.mocked(useAutoCheck).mockReturnValue({ running: true, elapsedSec: 5 })
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(cancelAutoCheck).toHaveBeenCalledWith('c1')
  })
})
