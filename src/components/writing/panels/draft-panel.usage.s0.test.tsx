// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import { recordDraftUseAction } from '@/server/actions/ai-features'
import type { WorkspaceApi, WritingData } from '../types'
import { DraftPanel } from './draft-panel'

// Stage 0: the panel says what is counted, and the append button records a number-only event.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/ai-features', () => ({
  createChapterFromDraftAction: vi.fn(),
  recordDraftUseAction: vi.fn(async () => ({ ok: true, data: undefined })),
}))

const encoder = new TextEncoder()
const NOTICE =
  '초안 품질을 높이려고 초안을 쓴 횟수와 고친 글자 비율 같은 숫자만 셉니다. 원고 내용은 모으지 않습니다.'

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

function draftResponse(text: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'X-Run-Id': 'run-1' } })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('DraftPanel usage notice (stage 0)', () => {
  it('shows the numbers-only notice', () => {
    render(<DraftPanel data={makeData()} api={makeApi()} />)
    expect(screen.getByText(NOTICE)).toBeInTheDocument()
  })

  it('records the draft use with the current manuscript length when appending', async () => {
    vi.mocked(fetch).mockResolvedValue(draftResponse('완성된 초안입니다.'))
    const api = makeApi()
    vi.mocked(api.getText).mockReturnValue('기존 원고')
    render(<DraftPanel data={makeData()} api={api} />)

    fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), {
      target: { value: '주인공이 성문을 연다.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '초안 쓰기' }))
    fireEvent.click(await screen.findByRole('button', { name: '현재 원고 끝에 붙이기' }))

    await waitFor(() =>
      expect(recordDraftUseAction).toHaveBeenCalledWith({
        workId: 'work-1',
        chapterId: 'c1',
        runId: 'run-1',
        priorChars: 5,
      }),
    )
  })
})
