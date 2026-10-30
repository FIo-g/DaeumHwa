// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import type { DraftPlanCard } from '@/lib/draft-plan'
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
  recordDraftUseAction: vi.fn(),
  planDraftAction: vi.fn(),
}))

const encoder = new TextEncoder()

const PLACEHOLDER = '무슨 일이 일어나야 하나요? 비워 두면 위키와 지난 화를 보고 계획을 제안해요.'
const REVISION_PLACEHOLDER = '계획을 한 줄로 고쳐 주세요 (예: 2장면에서 윤서가 먼저 말을 걸게)'

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

function makeCard(): DraftPlanCard {
  return {
    scenes: [
      {
        summary: '성문 앞에 선다.',
        goal: '안으로 들어간다',
        decision: '',
        stake: '',
        trigger: '',
        role: 'opening',
        place: '성문',
        characters: [],
        targetChars: 1250,
      },
      {
        summary: '경비와 맞선다.',
        goal: '통과한다',
        decision: '',
        stake: '',
        trigger: '',
        role: 'ending',
        place: '',
        characters: [],
        targetChars: 1250,
      },
    ],
    ending: { device: 'crisis', line: '문이 열린다.' },
    threads: [],
  }
}

function planResponse(card: DraftPlanCard) {
  return { ok: true, data: { runId: 'plan-1', card, warnings: [] } }
}

function draftResponse(text: string): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text))
        controller.close()
      },
    }),
    { headers: { 'X-Run-Id': 'run-1' } },
  )
}

function renderPanel() {
  return render(<DraftPanel data={makeData()} api={makeApi()} />)
}

function typeInstructions(value: string) {
  fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), { target: { value } })
}

/** The JSON body of the most recent draft request. */
function lastDraftBody(): Record<string, unknown> {
  const calls = vi.mocked(fetch).mock.calls
  const [, init] = calls[calls.length - 1]
  return JSON.parse(String((init as RequestInit).body))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('DraftPanel plan flow', () => {
  it('shows the plan placeholder and both the plan and write-now buttons', () => {
    renderPanel()

    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '계획 세우기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '바로 쓰기' })).toBeInTheDocument()
  })

  it('disables 바로 쓰기 while the instruction is empty', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: '바로 쓰기' })).toBeDisabled()
    typeInstructions('주인공이 성문을 연다.')
    expect(screen.getByRole('button', { name: '바로 쓰기' })).toBeEnabled()
  })

  it('shows the card from 계획 세우기 and writes it with the plan and edit counts', async () => {
    vi.mocked(planDraftAction).mockResolvedValue(planResponse(makeCard()) as never)
    vi.mocked(fetch).mockResolvedValue(draftResponse('완성된 초안입니다.'))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    expect(await screen.findByText('이번 화 계획')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '빼기' })[0])
    fireEvent.click(screen.getByRole('button', { name: '이 계획으로 쓰기' }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = lastDraftBody()
    expect(body.plan).toMatchObject({ scenes: [{ summary: '경비와 맞선다.' }] })
    expect(body.planRunId).toBe('plan-1')
    expect(body.planEdits).toEqual({ revisions: 0, removed: 1, moved: 0, textEdits: 0 })
  })

  it('sends the revision note with 다시 계획', async () => {
    vi.mocked(planDraftAction).mockResolvedValue(planResponse(makeCard()) as never)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')

    fireEvent.change(screen.getByPlaceholderText(REVISION_PLACEHOLDER), {
      target: { value: '윤서가 먼저' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    await waitFor(() => expect(planDraftAction).toHaveBeenCalledTimes(2))
    expect(vi.mocked(planDraftAction).mock.calls[1][0]).toMatchObject({
      revision: { note: '윤서가 먼저' },
    })
  })

  it('posts no plan from 바로 쓰기', async () => {
    vi.mocked(fetch).mockResolvedValue(draftResponse('완성된 초안입니다.'))
    renderPanel()

    typeInstructions('주인공이 성문을 연다.')
    fireEvent.click(screen.getByRole('button', { name: '바로 쓰기' }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = lastDraftBody()
    expect(body).not.toHaveProperty('plan')
    expect(body).not.toHaveProperty('planRunId')
    expect(body).not.toHaveProperty('planEdits')
  })
})

/** Focus, type and blur one scene summary, the way an author edits it. */
function editSummary(index: number, value: string) {
  const textarea = screen.getAllByLabelText('일어나는 일')[index]
  fireEvent.focus(textarea)
  fireEvent.change(textarea, { target: { value } })
  fireEvent.blur(textarea)
}

function writeFromCard() {
  fireEvent.click(screen.getByRole('button', { name: '이 계획으로 쓰기' }))
}

describe('DraftPanel plan edits', () => {
  it('counts a scene edited in two focus sessions once', async () => {
    vi.mocked(planDraftAction).mockResolvedValue(planResponse(makeCard()) as never)
    vi.mocked(fetch).mockResolvedValue(draftResponse('완성된 초안입니다.'))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')
    editSummary(1, '경비를 설득한다.')
    editSummary(1, '경비를 설득해 본다.')
    writeFromCard()

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(lastDraftBody().planEdits).toEqual({
      revisions: 0,
      removed: 0,
      moved: 0,
      textEdits: 1,
    })
  })

  it('counts nothing for a scene whose summary is restored to the planned text', async () => {
    vi.mocked(planDraftAction).mockResolvedValue(planResponse(makeCard()) as never)
    vi.mocked(fetch).mockResolvedValue(draftResponse('완성된 초안입니다.'))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')
    editSummary(1, '경비를 설득한다.')
    editSummary(1, '경비와 맞선다.')
    writeFromCard()

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(lastDraftBody().planEdits).toEqual({
      revisions: 0,
      removed: 0,
      moved: 0,
      textEdits: 0,
    })
  })

  it('counts an edited scene once even when it is also moved', async () => {
    vi.mocked(planDraftAction).mockResolvedValue(planResponse(makeCard()) as never)
    vi.mocked(fetch).mockResolvedValue(draftResponse('완성된 초안입니다.'))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')
    editSummary(0, '성문을 두드린다.')
    fireEvent.click(screen.getAllByRole('button', { name: '아래로' })[0])
    writeFromCard()

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(lastDraftBody().planEdits).toEqual({
      revisions: 0,
      removed: 0,
      moved: 1,
      textEdits: 1,
    })
  })

  it('clears the revision note after 다시 계획 succeeds', async () => {
    const revised = makeCard()
    revised.scenes[1].summary = '윤서가 먼저 말을 건다.'
    vi.mocked(planDraftAction)
      .mockResolvedValueOnce(planResponse(makeCard()) as never)
      .mockResolvedValueOnce({
        ok: true,
        data: { runId: 'plan-2', card: revised, warnings: [] },
      } as never)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')
    fireEvent.change(screen.getByPlaceholderText(REVISION_PLACEHOLDER), {
      target: { value: '2장면에서 윤서가 먼저 말을 걸게' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    await screen.findByDisplayValue('윤서가 먼저 말을 건다.')
    expect(screen.getByPlaceholderText(REVISION_PLACEHOLDER)).toHaveValue('')
    expect(screen.getByRole('button', { name: '다시 계획' })).toBeDisabled()
  })

  it('keeps the revision note when 다시 계획 fails', async () => {
    vi.mocked(planDraftAction)
      .mockResolvedValueOnce(planResponse(makeCard()) as never)
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'AI_FAILED', message: '다시 계획하지 못했습니다.' },
      } as never)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')
    fireEvent.change(screen.getByPlaceholderText(REVISION_PLACEHOLDER), {
      target: { value: '윤서가 먼저' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    await waitFor(() => expect(planDraftAction).toHaveBeenCalledTimes(2))
    expect(screen.getByPlaceholderText(REVISION_PLACEHOLDER)).toHaveValue('윤서가 먼저')
  })

  it('shows the per-scene length of the current 목표 분량', async () => {
    vi.mocked(planDraftAction).mockResolvedValue(planResponse(makeCard()) as never)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')
    expect(screen.getByText('장면 1 · 도입 · 약 1,250자')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('목표 분량 (자)'), { target: { value: '4000' } })

    expect(screen.getByText('장면 1 · 도입 · 약 2,000자')).toBeInTheDocument()
  })

  it('sends the quick-path body while a plan is on screen', async () => {
    vi.mocked(planDraftAction).mockResolvedValue(planResponse(makeCard()) as never)
    vi.mocked(fetch).mockResolvedValue(draftResponse('완성된 초안입니다.'))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')
    fireEvent.click(screen.getAllByRole('button', { name: '빼기' })[0])
    typeInstructions('주인공이 성문을 연다.')
    fireEvent.click(screen.getByRole('button', { name: '바로 쓰기' }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(lastDraftBody()).toEqual({
      chapterId: 'c1',
      entryIds: [],
      acceptsReplace: true,
      instructions: '주인공이 성문을 연다.',
      targetChars: 2500,
    })
  })
})
