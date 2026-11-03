// @vitest-environment jsdom
import { StrictMode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { ChapterRow, IssueRow, Role } from '@/db/types'
import { wasAutoChecked } from '@/lib/client/sample-session'
import { listProposalsAction } from '@/server/actions/proposals'
import { resolveIssueAction } from '@/server/actions/issues'
import type { SelectionRange, WritingData } from '../types'
import { CheckPanel } from './check-panel'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
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

function makeData(overrides: Partial<WritingData> = {}): WritingData {
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
    ...overrides,
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

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

function respondWith(body: unknown): void {
  fetchMock.mockResolvedValue(Response.json(body))
}

/**
 * Resolves only when the request's signal is still live. The first StrictMode mount aborts its
 * request, so this counts the runs that actually finish.
 */
function respondWhenNotAborted(body: unknown): () => number {
  let completed = 0
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal
        const abort = () => reject(new DOMException('Aborted', 'AbortError'))
        if (signal?.aborted) {
          abort()
          return
        }
        signal?.addEventListener('abort', abort, { once: true })
        queueMicrotask(() => {
          if (signal?.aborted) return
          completed += 1
          resolve(Response.json(body))
        })
      }),
  )
  return () => completed
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
  window.sessionStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(resolveIssueAction).mockResolvedValue({ ok: true, data: {} as never })
  vi.mocked(listProposalsAction).mockResolvedValue({ ok: true, data: [] as never })
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
  vi.restoreAllMocks()
})

describe('CheckPanel autoRun', () => {
  it('runs the check once on mount and drops demo from the URL', async () => {
    respondWith({
      ok: true,
      data: { issues: [], proposals: [], runIds: [], namingIssueCount: 0 },
    })
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const api = makeApi()
    const { rerender } = render(<CheckPanel data={makeData()} api={api} text="본문" autoRun />)

    rerender(<CheckPanel data={makeData()} api={api} text="본문" autoRun />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/works/work-1/chapters/c1/check')
    expect(replaceSpy).toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalledWith('취소했습니다.')
  })

  it('does not open the approval dialog in auto mode', async () => {
    respondWith({
      ok: true,
      data: {
        issues: [],
        proposals: [{ id: 'proposal-1' }],
        runIds: ['run-1'],
        namingIssueCount: 0,
      },
    })
    render(<CheckPanel data={makeData()} api={makeApi()} text="본문" autoRun />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // The check finished (success toast shown); the dialog must stay closed in auto mode.
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not run without autoRun', async () => {
    render(<CheckPanel data={makeData()} api={makeApi()} text="본문" />)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('runs once under StrictMode and finishes', async () => {
    const completed = respondWhenNotAborted({
      ok: true,
      data: {
        issues: [makeIssue()],
        proposals: [],
        runIds: [],
        namingIssueCount: 0,
      },
    })

    render(
      <StrictMode>
        <CheckPanel data={makeData()} api={makeApi()} text="본문" autoRun />
      </StrictMode>,
    )

    await waitFor(() => expect(screen.getByText('그는 왼손에 검을 쥐었다.')).toBeInTheDocument())
    expect(completed()).toBe(1)
    await waitFor(() => expect(screen.queryByText('점검 중')).toBeNull())
  })

  it('does not run again after a successful auto check when remounted', async () => {
    respondWith({
      ok: true,
      data: { issues: [makeIssue()], proposals: [], runIds: [], namingIssueCount: 0 },
    })
    const api = makeApi()
    const view = render(<CheckPanel data={makeData()} api={api} text="본문" autoRun />)

    await waitFor(() => expect(wasAutoChecked('c1')).toBe(true))
    view.unmount()
    render(<CheckPanel data={makeData()} api={api} text="본문" autoRun />)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not auto run when the chapter is not editable', async () => {
    render(<CheckPanel data={makeData({ role: 'viewer' })} api={makeApi()} text="본문" autoRun />)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the error and does not mark the chapter when the check fails', async () => {
    respondWith({
      ok: false,
      error: { code: 'BAD_STATE', message: '잠시 후 다시 시도해 주세요.' },
    })

    render(<CheckPanel data={makeData()} api={makeApi()} text="본문" autoRun />)

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('잠시 후 다시 시도해 주세요.'),
    )
    expect(wasAutoChecked('c1')).toBe(false)
  })
})
