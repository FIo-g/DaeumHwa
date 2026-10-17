// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { ChapterRow, IssueRow, ProposalRow, Role } from '@/db/types'
import type { ProposalView } from '@/server/proposals'
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

const resolveIssue = vi.mocked(resolveIssueAction)
const listProposals = vi.mocked(listProposalsAction)

const QUOTE = '그는 왼손에 검을 쥐었다.'
const WIKI = '서윤은 오른손잡이다.'
const SUGGESTION = '그는 오른손에 검을 쥐었다.'

function makeIssue(overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    id: 'issue-1',
    workId: 'work-1',
    chapterId: 'c1',
    runId: null,
    kind: 'contradiction',
    severity: 'high',
    quote: QUOTE,
    quoteStart: 4,
    quoteEnd: 4 + QUOTE.length,
    entryId: 'entry-1',
    factId: 'fact-1',
    wikiExcerpt: WIKI,
    explanation: '손 방향이 위키와 다릅니다.',
    suggestion: SUGGESTION,
    status: 'open',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date('2026-10-16T00:00:00Z'),
    ...overrides,
  }
}

function makeData(overrides: Partial<WritingData> = {}): WritingData {
  return {
    workId: 'work-1',
    workTitle: '테스트 작품',
    role: 'editor' as Role,
    demo: false,
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
    entries: [{ id: 'entry-1', kind: 'character', name: '이서윤', aliases: [], summary: '' }],
    namingRules: [],
    threads: [],
    issues: [makeIssue()],
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

function makeProposal(): ProposalView {
  return {
    id: 'proposal-1',
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
    source: 'post_chapter',
    sourceRef: 'run-1',
    chapterId: 'c1',
    decidedBy: null,
    decidedAt: null,
    decisionNote: '',
    appliedTargetId: null,
    createdAt: new Date('2026-10-16T00:00:00Z'),
    chapterPosition: 3,
    chapterTitle: '재회',
    groupKey: 'name:이서윤',
    groupLabel: '이서윤',
  } as unknown as ProposalView
}

/** An editor whose text really changes, so undo can be checked against the document. */
function makeTextApi(initial: string) {
  let text = initial
  return {
    getText: vi.fn(() => text),
    replaceRange: vi.fn((start: number, end: number, replacement: string) => {
      text = text.slice(0, start) + replacement + text.slice(end)
    }),
    replaceQuote: vi.fn((quote: string, replacement: string, hintStart?: number) => {
      const index = text.indexOf(quote, hintStart ?? 0)
      if (index < 0) return false
      text = text.slice(0, index) + replacement + text.slice(index + quote.length)
      return true
    }),
    appendText: vi.fn(),
    setHighlights: vi.fn(),
    focusRange: vi.fn(),
    getSelection: vi.fn((): SelectionRange | null => null),
    saveNow: vi.fn(async () => {}),
    refresh: vi.fn(),
    type(extra: string) {
      text += extra
    },
  }
}

/** The action of the most recent toast call, for pressing 되돌리기. */
function lastToastAction(): () => void {
  const calls = vi.mocked(toast).mock.calls
  const options = calls[calls.length - 1][1] as unknown as { action: { onClick: () => void } }
  return options.action.onClick
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  resolveIssue.mockResolvedValue({ ok: true, data: makeIssue({ status: 'accepted' }) })
  listProposals.mockResolvedValue({ ok: true, data: [makeProposal()] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function respondWith(body: unknown): void {
  fetchMock.mockResolvedValue(Response.json(body))
}

afterEach(() => {
  cleanup()
})

describe('CheckPanel', () => {
  it('saves the chapter before running the chapter check through its route', async () => {
    respondWith({
      ok: true,
      data: { issues: [], proposals: [], runIds: [], namingIssueCount: 0 },
    })
    const api = makeApi()
    render(<CheckPanel data={makeData({ issues: [] })} api={api} text="본문" />)

    fireEvent.click(screen.getByRole('button', { name: '회차 점검' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/works/work-1/chapters/c1/check')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(api.saveNow).toHaveBeenCalledTimes(1)
    expect(api.saveNow.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    )
  })

  it('sends the slow AI check as a fetch, not a Server Action, while the request stays open', async () => {
    // The check never resolves here, like a slow AI call. The panel must not queue it as a
    // Server Action, which would block autosave until it returns.
    fetchMock.mockReturnValue(new Promise<Response>(() => {}))
    const api = makeApi()
    render(<CheckPanel data={makeData({ issues: [] })} api={api} text="본문" />)

    fireEvent.click(screen.getByRole('button', { name: '회차 점검' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/works/work-1/chapters/c1/check')
    expect(screen.getByRole('button', { name: '점검 중… (AI)' })).toBeTruthy()
  })

  it('shows the manuscript sentence and the wiki evidence side by side', () => {
    render(<CheckPanel data={makeData()} api={makeApi()} text={`안녕.\n${QUOTE}`} />)

    expect(screen.getByText('원고')).toBeTruthy()
    expect(screen.getByText('위키')).toBeTruthy()
    expect(screen.getByText(QUOTE)).toBeTruthy()
    expect(screen.getByText(WIKI)).toBeTruthy()
  })

  it('applies the suggestion to the manuscript and marks the issue accepted', async () => {
    const api = makeApi()
    render(<CheckPanel data={makeData()} api={api} text={`안녕.\n${QUOTE}`} />)

    fireEvent.click(screen.getByRole('button', { name: '제안대로 고치기' }))

    await waitFor(() =>
      expect(resolveIssue).toHaveBeenCalledWith({ issueId: 'issue-1', status: 'accepted' }),
    )
    expect(api.replaceQuote).toHaveBeenCalledWith(QUOTE, SUGGESTION, 4)
    expect(api.replaceQuote.mock.invocationCallOrder[0]).toBeLessThan(
      resolveIssue.mock.invocationCallOrder[0],
    )
  })

  it('opens the approval dialog with the count when the check finds wiki candidates', async () => {
    respondWith({
      ok: true,
      data: {
        issues: [],
        proposals: [{ id: 'proposal-1' } as ProposalRow],
        runIds: ['run-1'],
        namingIssueCount: 0,
      },
    })
    render(<CheckPanel data={makeData({ issues: [] })} api={makeApi()} text="본문" />)

    fireEvent.click(screen.getByRole('button', { name: '회차 점검' }))

    expect(await screen.findByText('이 회차에서 찾은 위키 후보 1건')).toBeTruthy()
    expect(listProposals).toHaveBeenCalledWith({
      workId: 'work-1',
      chapterId: 'c1',
      status: 'pending',
    })
  })

  it('shows no fix button when the suggestion is empty', () => {
    render(
      <CheckPanel
        data={makeData({ issues: [makeIssue({ suggestion: '' })] })}
        api={makeApi()}
        text={`안녕.\n${QUOTE}`}
      />,
    )

    expect(screen.queryByRole('button', { name: '제안대로 고치기' })).toBeNull()
  })

  it('shows no fix button for thread or timeline issues, whose advice cannot replace a sentence', () => {
    render(
      <CheckPanel
        data={makeData({
          issues: [
            makeIssue({ id: 'issue-t', kind: 'thread' }),
            makeIssue({ id: 'issue-l', kind: 'timeline' }),
          ],
        })}
        api={makeApi()}
        text={`안녕.\n${QUOTE}`}
      />,
    )

    expect(screen.queryByRole('button', { name: '제안대로 고치기' })).toBeNull()
  })

  it('undoes an applied fix from the toast while the text is unchanged', async () => {
    const text = `안녕.\n${QUOTE}`
    const api = makeTextApi(text)
    render(<CheckPanel data={makeData()} api={api} text={text} />)

    fireEvent.click(screen.getByRole('button', { name: '제안대로 고치기' }))
    await waitFor(() => expect(resolveIssue).toHaveBeenCalled())
    expect(api.getText()).toBe(`안녕.\n${SUGGESTION}`)

    lastToastAction()()
    expect(api.getText()).toBe(text)
  })

  it('does not undo a fix when the text changed after it', async () => {
    const text = `안녕.\n${QUOTE}`
    const api = makeTextApi(text)
    render(<CheckPanel data={makeData()} api={api} text={text} />)

    fireEvent.click(screen.getByRole('button', { name: '제안대로 고치기' }))
    await waitFor(() => expect(resolveIssue).toHaveBeenCalled())
    api.type(' 그리고 더 썼다.')

    lastToastAction()()
    expect(api.getText()).toBe(`안녕.\n${SUGGESTION} 그리고 더 썼다.`)
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('그 사이 원고가 바뀌어 되돌릴 수 없습니다.')
  })

  it('hides the check and fix controls for commenters', () => {
    render(<CheckPanel data={makeData({ role: 'commenter' })} api={makeApi()} text="본문" />)

    expect(screen.queryByRole('button', { name: '회차 점검' })).toBeNull()
    expect(screen.queryByRole('button', { name: '제안대로 고치기' })).toBeNull()
  })
})
