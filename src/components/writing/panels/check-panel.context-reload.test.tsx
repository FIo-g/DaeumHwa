// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, IssueRow, Role } from '@/db/types'
import { useAutoCheck } from '@/lib/client/auto-check'
import { postAction } from '@/lib/client/post-json'
import { getCheckContextAction } from '@/server/actions/checks'
import type { CheckContextView } from '@/server/check-context'
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

vi.mock('@/lib/client/post-json', () => ({
  postAction: vi.fn(),
}))

vi.mock('@/server/actions/checks', () => ({
  getCheckContextAction: vi.fn(),
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

const getContextAction = vi.mocked(getCheckContextAction)
const post = vi.mocked(postAction)

function makeView(): CheckContextView {
  return {
    position: 3,
    entries: [],
    trimmedEntryNames: [],
    threads: [],
    previousSummaries: [],
    relationCount: 0,
    namingRuleCount: 0,
    totalEntries: 0,
  }
}

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAutoCheck).mockReturnValue({ running: false, elapsedSec: 0, result: null })
  getContextAction.mockResolvedValue({ ok: true, data: makeView() })
})

afterEach(() => {
  cleanup()
})

describe('CheckPanel check context reload', () => {
  it('reloads the open check context when a check finishes', async () => {
    const data = makeData()
    const api = makeApi()
    post.mockResolvedValue({
      ok: true,
      data: { issues: [], proposals: [], runIds: [], namingIssueCount: 0 },
    })

    const { rerender } = render(<CheckPanel data={data} api={api} text="본문" />)

    fireEvent.click(screen.getByRole('button', { name: 'AI가 참고한 설정 보기' }))
    await waitFor(() => expect(getContextAction).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '회차 점검' }))
    await waitFor(() => expect(getContextAction).toHaveBeenCalledTimes(2))

    vi.mocked(useAutoCheck).mockReturnValue({
      running: false,
      elapsedSec: 0,
      result: { issues: [makeIssue()], proposals: [], runIds: [], namingIssueCount: 0 },
    })
    rerender(<CheckPanel data={data} api={api} text="본문" />)
    await waitFor(() => expect(getContextAction).toHaveBeenCalledTimes(3))

    post.mockResolvedValue({
      ok: false,
      error: { code: 'BAD_STATE', message: '잠시 후 다시 시도해 주세요.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '회차 점검' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(getContextAction).toHaveBeenCalledTimes(3)
  })

  it('does not reload the check context when a check is cancelled', async () => {
    const data = makeData()
    const api = makeApi()
    render(<CheckPanel data={data} api={api} text="본문" />)

    fireEvent.click(screen.getByRole('button', { name: 'AI가 참고한 설정 보기' }))
    await waitFor(() => expect(getContextAction).toHaveBeenCalledTimes(1))

    post.mockReturnValue(new Promise<never>(() => {}))
    fireEvent.click(screen.getByRole('button', { name: '회차 점검' }))
    const cancelButton = await screen.findByRole('button', { name: '취소' })
    fireEvent.click(cancelButton)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '회차 점검' })).toBeInTheDocument(),
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(getContextAction).toHaveBeenCalledTimes(1)
  })
})
