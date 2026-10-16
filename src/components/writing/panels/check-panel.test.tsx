// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, IssueRow, ProposalRow, Role } from '@/db/types'
import type { ProposalView } from '@/server/proposals'
import { runChapterCheckAction } from '@/server/actions/checks'
import { listProposalsAction } from '@/server/actions/proposals'
import { resolveIssueAction } from '@/server/actions/issues'
import type { SelectionRange, WritingData } from '../types'
import { CheckPanel } from './check-panel'

vi.mock('@/server/actions/checks', () => ({
  runChapterCheckAction: vi.fn(),
  runProofreadAction: vi.fn(),
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

const runCheck = vi.mocked(runChapterCheckAction)
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

beforeEach(() => {
  vi.clearAllMocks()
  resolveIssue.mockResolvedValue({ ok: true, data: makeIssue({ status: 'accepted' }) })
  listProposals.mockResolvedValue({ ok: true, data: [makeProposal()] })
})

afterEach(() => {
  cleanup()
})

describe('CheckPanel', () => {
  it('saves the chapter before running the chapter check', async () => {
    runCheck.mockResolvedValue({
      ok: true,
      data: { issues: [], proposals: [], runIds: [], namingIssueCount: 0 },
    })
    const api = makeApi()
    render(<CheckPanel data={makeData({ issues: [] })} api={api} text="본문" />)

    fireEvent.click(screen.getByRole('button', { name: '회차 점검' }))

    await waitFor(() => expect(runCheck).toHaveBeenCalledWith({ chapterId: 'c1' }))
    expect(api.saveNow).toHaveBeenCalledTimes(1)
    expect(api.saveNow.mock.invocationCallOrder[0]).toBeLessThan(
      runCheck.mock.invocationCallOrder[0],
    )
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
    runCheck.mockResolvedValue({
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

  it('hides the check and fix controls for commenters', () => {
    render(<CheckPanel data={makeData({ role: 'commenter' })} api={makeApi()} text="본문" />)

    expect(screen.queryByRole('button', { name: '회차 점검' })).toBeNull()
    expect(screen.queryByRole('button', { name: '제안대로 고치기' })).toBeNull()
  })
})
