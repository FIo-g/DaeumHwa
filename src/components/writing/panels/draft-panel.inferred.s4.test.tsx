// @vitest-environment jsdom
// Task 3: the draft panel shows inferred proposal count with a link to the requests tab.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import { listDirectivesAction, listInferredProposalsAction } from '@/server/actions/wiki'
import type { WorkspaceApi, WritingData } from '../types'
import { DraftPanel } from './draft-panel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/ai-features', () => ({
  createChapterFromDraftAction: vi.fn(),
  draftFindingsAction: vi.fn(),
  planDraftAction: vi.fn(),
  recordDraftUseAction: vi.fn(),
}))

vi.mock('@/server/actions/wiki', () => ({
  createDirectiveAction: vi.fn(),
  listDirectivesAction: vi.fn(),
  listInferredProposalsAction: vi.fn(),
}))

function makeData(): WritingData {
  return {
    workId: 'work-1',
    workTitle: '테스트 작품',
    role: 'editor' as Role,
    targetChars: 2500,
    chapter: {
      id: 'c1',
      workId: 'work-1',
      position: 1,
      title: '1화',
      body: '',
      status: 'done',
      version: 1,
      archivedAt: null,
    } as unknown as ChapterRow,
    chapters: [{ id: 'c1', position: 1, title: '1화' }],
    entries: [],
    namingRules: [],
    threads: [],
    issues: [],
    comments: [],
    pendingProposalCount: 0,
  }
}

function makeApi(): WorkspaceApi {
  return {
    getText: vi.fn(() => ''),
    replaceRange: vi.fn(),
    replaceQuote: vi.fn(() => false),
    appendText: vi.fn(),
    setHighlights: vi.fn(),
    focusRange: vi.fn(),
    getSelection: vi.fn(() => null),
    saveNow: vi.fn(async () => {}),
    refresh: vi.fn(),
  }
}

beforeEach(() => {
  vi.mocked(listDirectivesAction).mockResolvedValue({ ok: true, data: [] } as never)
  vi.mocked(listInferredProposalsAction).mockResolvedValue({
    ok: true,
    data: [{ index: 0 }, { index: 1 }],
  } as never)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('DraftPanel inferred line (s4)', () => {
  it('shows the inferred count with a link to the requests tab without calling the infer route', async () => {
    render(<DraftPanel data={makeData()} api={makeApi()} />)
    expect(await screen.findByText('새 요청 제안 2개')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '보기' })).toHaveAttribute(
      'href',
      '/works/work-1/wiki?tab=requests',
    )
    expect(vi.mocked(listInferredProposalsAction)).toHaveBeenCalledWith({
      workId: 'work-1',
      chapterId: 'c1',
    })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('hides the line when the read fails', async () => {
    vi.mocked(listInferredProposalsAction).mockResolvedValue({ ok: false } as never)
    render(<DraftPanel data={makeData()} api={makeApi()} />)
    await waitFor(() => expect(vi.mocked(listInferredProposalsAction)).toHaveBeenCalled())
    expect(screen.queryByText(/새 요청 제안/)).not.toBeInTheDocument()
  })
})
