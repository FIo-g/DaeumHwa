// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/db/types'
import type { ChapterRow } from '@/db/types'
import type { DraftCheckResult } from '@/server/draft-check'
import {
  applySceneFixAction,
  discardSceneFixAction,
  draftFindingsAction,
} from '@/server/actions/ai-features'
import type { WorkspaceApi, WritingData } from '../types'
import { DraftCheck } from './draft-check'
import { DraftPanel } from './draft-panel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/ai-features', () => ({
  createChapterFromDraftAction: vi.fn(),
  applyDraftRefinementAction: vi.fn(),
  applySceneFixAction: vi.fn(),
  discardSceneFixAction: vi.fn(),
  draftFindingsAction: vi.fn(),
  planDraftAction: vi.fn(),
  recordDraftUseAction: vi.fn(),
}))

const encoder = new TextEncoder()

const FIX_RESULT: DraftCheckResult = {
  findings: [
    { scene: 2, reason: 'skipped-moment', note: '편지를 읽는 순간' },
    { scene: 3, reason: 'request', note: "'입꼬리'" },
  ],
  fix: {
    scenes: [{ scene: 2, reasons: ['skipped-moment'] }],
    parts: [
      { type: 'equal', value: '민준은 ' },
      { type: 'delete', value: '문을 ' },
      { type: 'insert', value: '창을 ' },
      { type: 'equal', value: '열었다.' },
    ],
    token: 'token-1',
  },
  notice: null,
}

const EMPTY_RESULT: DraftCheckResult = { findings: [], fix: null, notice: null }

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  })
}

function renderCheck(result: DraftCheckResult = FIX_RESULT) {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true, data: result }))
  const onApplied = vi.fn()
  const onPreviewChange = vi.fn()
  render(
    <DraftCheck
      workId="work-1"
      runId="run-1"
      onApplied={onApplied}
      onPreviewChange={onPreviewChange}
    />,
  )
  return { onApplied, onPreviewChange }
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

function fullStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

function draftResponse(text: string): Response {
  return new Response(fullStream(text), { headers: { 'X-Run-Id': 'run-1' } })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(draftFindingsAction).mockResolvedValue({
    ok: true,
    data: { findings: [], directives: [] },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('DraftCheck', () => {
  it('calls the check route once when mounted', async () => {
    renderCheck()

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/works/work-1/draft/check')
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ runId: 'run-1' }),
    })
  })

  it('shows the checking state while the request runs', () => {
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}))
    render(
      <DraftCheck workId="work-1" runId="run-1" onApplied={vi.fn()} onPreviewChange={vi.fn()} />,
    )

    expect(screen.getByText(/점검하는 중/)).toBeTruthy()
  })

  it('renders the findings and the fixed-scenes preview', async () => {
    const { onPreviewChange } = renderCheck()

    expect(await screen.findByText('점검 결과')).toBeTruthy()
    expect(screen.getByText('장면 2: 중요한 순간을 설명으로 넘김')).toBeTruthy()
    expect(screen.getByText('장면 3: 요청과 다름')).toBeTruthy()
    expect(screen.getByText('고친 장면 미리 보기')).toBeTruthy()
    expect(screen.getByText('초록은 새 글, 빨강 취소선은 지워지는 글입니다.')).toBeTruthy()
    expect(onPreviewChange).toHaveBeenLastCalledWith(true)
  })

  it('shows the notice line when the result carries one', async () => {
    renderCheck({
      findings: [{ scene: 1, reason: 'request', note: "'입꼬리'" }],
      fix: null,
      notice: 'AI 점검을 하지 못했습니다. 코드 점검 결과만 보여 드립니다.',
    })

    expect(await screen.findByText('점검 결과')).toBeTruthy()
    expect(
      screen.getByText('AI 점검을 하지 못했습니다. 코드 점검 결과만 보여 드립니다.'),
    ).toBeTruthy()
  })

  it('says nothing needed fixing when there are no findings', async () => {
    const { onPreviewChange } = renderCheck(EMPTY_RESULT)

    expect(await screen.findByText('고칠 곳을 찾지 못했습니다.')).toBeTruthy()
    expect(onPreviewChange).not.toHaveBeenCalledWith(true)
  })

  it('적용 calls the action with the token and passes the text to onApplied', async () => {
    vi.mocked(applySceneFixAction).mockResolvedValue({
      ok: true,
      data: { runId: 'run-1', text: '고친 본문' },
    })
    const { onApplied, onPreviewChange } = renderCheck()
    await screen.findByText('고친 장면 미리 보기')

    fireEvent.click(screen.getByRole('button', { name: '적용' }))

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith('고친 본문'))
    expect(applySceneFixAction).toHaveBeenCalledWith({
      workId: 'work-1',
      runId: 'run-1',
      token: 'token-1',
    })
    expect(toast.success).toHaveBeenCalledWith('고친 장면으로 바꿨습니다.')
    expect(onPreviewChange).toHaveBeenLastCalledWith(false)
  })

  it('버리기 calls the discard action and keeps the draft', async () => {
    vi.mocked(discardSceneFixAction).mockResolvedValue({ ok: true, data: { runId: 'run-1' } })
    const { onApplied, onPreviewChange } = renderCheck()
    await screen.findByText('고친 장면 미리 보기')

    fireEvent.click(screen.getByRole('button', { name: '버리기' }))

    await waitFor(() =>
      expect(discardSceneFixAction).toHaveBeenCalledWith({
        workId: 'work-1',
        runId: 'run-1',
        token: 'token-1',
      }),
    )
    expect(onApplied).not.toHaveBeenCalled()
    expect(onPreviewChange).toHaveBeenLastCalledWith(false)
  })

  it('shows the failure line when the request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network'))
    render(
      <DraftCheck workId="work-1" runId="run-1" onApplied={vi.fn()} onPreviewChange={vi.fn()} />,
    )

    expect(await screen.findByText('점검을 하지 못했습니다.')).toBeTruthy()
  })
})

describe('DraftPanel with DraftCheck', () => {
  const DRAFT = [
    '첫 장면이다. 문이 열렸다.',
    '둘째 장면이다. 편지를 읽었다.',
    '셋째 장면이다. 밤이 깊었다.',
  ].join('\n\n***\n\n')

  function mockFetchFor(checkBody: Response) {
    vi.mocked(fetch).mockImplementation((url) => {
      const target = String(url)
      if (target.endsWith('/draft/check')) return Promise.resolve(checkBody)
      if (target.endsWith('/draft/refine')) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            data: { runId: 'run-1', changed: false, parts: [], repairState: 'none' },
          }),
        )
      }
      return Promise.resolve(draftResponse(DRAFT))
    })
  }

  function startDraft() {
    fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), {
      target: { value: '주인공이 성문을 연다.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '바로 쓰기' }))
  }

  it('keeps the append button enabled when the check request fails', async () => {
    mockFetchFor(new Response('oops', { status: 500 }))
    render(<DraftPanel data={makeData()} api={makeApi()} />)

    startDraft()
    expect(await screen.findByText('점검을 하지 못했습니다.')).toBeTruthy()

    const append = screen.getByRole('button', { name: '현재 원고 끝에 붙이기' })
    expect(append.hasAttribute('disabled')).toBe(false)
  })

  it('disables append, new chapter and 다듬기 while the fix preview is open', async () => {
    mockFetchFor(jsonResponse({ ok: true, data: FIX_RESULT }))
    vi.mocked(discardSceneFixAction).mockResolvedValue({ ok: true, data: { runId: 'run-1' } })
    render(<DraftPanel data={makeData()} api={makeApi()} />)

    startDraft()
    await screen.findByText('고친 장면 미리 보기')

    const append = screen.getByRole('button', { name: '현재 원고 끝에 붙이기' })
    const chapter = screen.getByRole('button', { name: '새 회차로 만들기' })
    const refine = screen.getByRole('button', { name: '다듬기' })
    expect(append.hasAttribute('disabled')).toBe(true)
    expect(chapter.hasAttribute('disabled')).toBe(true)
    expect(refine.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '버리기' }))
    await waitFor(() => expect(append.hasAttribute('disabled')).toBe(false))
    expect(screen.getByRole('button', { name: '다듬기' }).hasAttribute('disabled')).toBe(false)
  })
})
