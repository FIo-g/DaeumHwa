// @vitest-environment jsdom
// Stage 2 (task 6): the instruction box can keep its instruction as a request, and the panel shows
// how many requests apply.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthorDirectiveRow, ChapterRow, Role } from '@/db/types'
import type { DraftPlanCard } from '@/lib/draft-plan'
import { createDirectiveAction, listDirectivesAction } from '@/server/actions/wiki'
import { planDraftAction } from '@/server/actions/ai-features'
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
      status: 'draft',
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

function makeRow(id: string, status: 'active' | 'off' = 'active'): AuthorDirectiveRow {
  return {
    id,
    status,
    scope: 'work',
    kind: 'content',
    text: `요청 ${id}`,
  } as unknown as AuthorDirectiveRow
}

function makeCard(): DraftPlanCard {
  return {
    scenes: [
      {
        summary: '성문 앞에 선다.',
        goal: '',
        decision: '',
        stake: '',
        trigger: '',
        role: 'opening',
        place: '',
        characters: [],
        targetChars: 1250,
      },
      {
        summary: '문이 열린다.',
        goal: '',
        decision: '',
        stake: '',
        trigger: '',
        role: 'ending',
        place: '',
        characters: [],
        targetChars: 1250,
      },
    ],
    ending: { device: 'question', line: '누가 문을 열었나?' },
    threads: [],
    requests: [],
  }
}

function renderPanel() {
  return render(<DraftPanel data={makeData()} api={makeApi()} />)
}

beforeEach(() => {
  vi.mocked(listDirectivesAction).mockResolvedValue({
    ok: true,
    data: [makeRow('a'), makeRow('b')],
  } as never)
  vi.mocked(planDraftAction).mockResolvedValue({
    ok: true,
    data: { runId: 'run-1', card: makeCard(), warnings: [] },
  } as never)
  vi.mocked(createDirectiveAction).mockResolvedValue({ ok: true, data: makeRow('new') } as never)
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('DraftPanel request ledger (stage 2)', () => {
  it('shows how many requests apply and links to the requests tab', async () => {
    renderPanel()

    const count = await screen.findByText('적용 중인 요청 2개')
    expect(count).toBeInTheDocument()
    // The count sits above the instruction box, not below the keep-instruction checkbox.
    const box = document.getElementById('draft-instructions')
    expect(box).not.toBeNull()
    expect(
      count.compareDocumentPosition(box as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: '보기' })).toHaveAttribute(
      'href',
      '/works/work-1/wiki?tab=requests',
    )
  })

  it('hides the count line when no request applies', async () => {
    vi.mocked(listDirectivesAction).mockResolvedValue({ ok: true, data: [] } as never)
    renderPanel()

    await waitFor(() => expect(listDirectivesAction).toHaveBeenCalled())
    expect(screen.queryByText(/적용 중인 요청/)).not.toBeInTheDocument()
  })

  it('keeps the instruction as a request when the plan starts with the box checked', async () => {
    renderPanel()

    fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), {
      target: { value: '윤서는 끝까지 존댓말을 쓴다.' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: '이 지시를 앞으로도 지키기' }))
    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))

    await waitFor(() => expect(planDraftAction).toHaveBeenCalled())
    expect(createDirectiveAction).toHaveBeenCalledWith({
      workId: 'work-1',
      scope: 'work',
      kind: 'content',
      text: '윤서는 끝까지 존댓말을 쓴다.',
      source: 'instruction',
    })
    expect(screen.getByRole('checkbox', { name: '이 지시를 앞으로도 지키기' })).not.toBeChecked()
  })

  it('still starts the plan when keeping the instruction fails', async () => {
    vi.mocked(createDirectiveAction).mockResolvedValue({
      ok: false,
      error: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
    } as never)
    renderPanel()

    fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), {
      target: { value: '윤서가 문을 연다.' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: '이 지시를 앞으로도 지키기' }))
    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))

    await waitFor(() => expect(planDraftAction).toHaveBeenCalled())
    expect(createDirectiveAction).toHaveBeenCalledTimes(1)
  })
})
