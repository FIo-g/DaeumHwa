// @vitest-environment jsdom
// Stage 2 review (group A1): a revision note is kept as a request only after the target check passes.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
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

describe('DraftPanel plan revision keep (stage 2 review)', () => {
  async function planOnce() {
    renderPanel()
    fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), {
      target: { value: '윤서가 문을 연다.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByRole('region', { name: '이번 화 계획' })
  }

  it('keeps the revision note as a request when the target is valid', async () => {
    await planOnce()

    fireEvent.click(screen.getByRole('checkbox', { name: '앞으로도 이렇게' }))
    fireEvent.change(screen.getByLabelText('계획 고치는 말'), {
      target: { value: '2장면에서 윤서가 먼저 말을 걸게' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    await waitFor(() => expect(planDraftAction).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(createDirectiveAction).toHaveBeenCalledWith({
        workId: 'work-1',
        scope: 'work',
        kind: 'content',
        text: '2장면에서 윤서가 먼저 말을 걸게',
        source: 'revision',
      }),
    )
    expect(createDirectiveAction).toHaveBeenCalledTimes(1)
  })

  it('does not keep the revision note when the target check fails', async () => {
    await planOnce()

    fireEvent.change(screen.getByLabelText('목표 분량 (자)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '앞으로도 이렇게' }))
    fireEvent.change(screen.getByLabelText('계획 고치는 말'), {
      target: { value: '2장면에서 윤서가 먼저 말을 걸게' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(planDraftAction).toHaveBeenCalledTimes(1)
    expect(createDirectiveAction).not.toHaveBeenCalled()
  })
})
