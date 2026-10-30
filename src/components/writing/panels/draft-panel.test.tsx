// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import type { WorkspaceApi, WritingData } from '../types'
import { draftErrorRecord } from '@/lib/draft-stream'
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
}))

const encoder = new TextEncoder()

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

/** A stream that sends `text`, then fails on the next read, like a dropped or timed-out draft. */
function brokenStream(text: string): ReadableStream<Uint8Array> {
  let sent = false
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent && text !== '') {
        sent = true
        controller.enqueue(encoder.encode(text))
        return
      }
      controller.error(new Error('stream broke'))
    },
  })
}

/** A stream that sends `text` and then stays open, like a draft still being written. */
function openStream(text: string): ReadableStream<Uint8Array> {
  let sent = false
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) {
        sent = true
        controller.enqueue(encoder.encode(text))
      }
      return new Promise(() => {})
    },
  })
}

function draftResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { headers: { 'X-Run-Id': 'run-1' } })
}

function renderPanel() {
  return render(<DraftPanel data={makeData()} api={makeApi()} />)
}

function startDraft(instructions = '주인공이 성문을 연다.') {
  fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), {
    target: { value: instructions },
  })
  fireEvent.click(screen.getByRole('button', { name: '바로 쓰기' }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('DraftPanel stream results', () => {
  it('offers the new chapter button only after a complete draft', async () => {
    vi.mocked(fetch).mockResolvedValue(
      draftResponse(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('완성된 초안입니다.'))
            controller.close()
          },
        }),
      ),
    )
    renderPanel()
    startDraft()

    expect(await screen.findByRole('button', { name: '새 회차로 만들기' })).toBeInTheDocument()
    expect(screen.queryByText('중간에 멈춘 초안입니다.')).not.toBeInTheDocument()
  })

  it('keeps the partial text and offers only append when the stream breaks mid-way', async () => {
    vi.mocked(fetch).mockResolvedValue(draftResponse(brokenStream('앞부분 초안')))
    renderPanel()
    startDraft()

    expect(await screen.findByText('중간에 멈춘 초안입니다.')).toBeInTheDocument()
    expect(screen.getByText('앞부분 초안')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '현재 원고 끝에 붙이기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 회차로 만들기' })).not.toBeInTheDocument()
    expect(toast.error).toHaveBeenCalled()
  })

  it('removes the waiting preview when the stream breaks before any text', async () => {
    vi.mocked(fetch).mockResolvedValue(draftResponse(brokenStream('')))
    renderPanel()
    startDraft()

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.queryByText('초안을 기다리는 중입니다.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 회차로 만들기' })).not.toBeInTheDocument()
  })

  it('marks the draft as stopped when the author cancels, and hides the new chapter button', async () => {
    vi.mocked(fetch).mockResolvedValue(draftResponse(openStream('취소 전 글')))
    renderPanel()
    startDraft()

    expect(await screen.findByText('취소 전 글')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(await screen.findByText('중간에 멈춘 초안입니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 회차로 만들기' })).not.toBeInTheDocument()
  })

  it('shows the error the stream ends with, drops the record from the draft, and marks it stopped', async () => {
    const message = 'AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도해 주세요.'
    vi.mocked(fetch).mockResolvedValue(
      draftResponse(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(`앞부분 초안${draftErrorRecord(message)}`))
            controller.close()
          },
        }),
      ),
    )
    renderPanel()
    startDraft()

    expect(await screen.findByText('중간에 멈춘 초안입니다.')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(message)
    expect(screen.getByText('앞부분 초안')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('\u001e')
    expect(document.body.textContent).not.toContain('"error"')
    expect(screen.queryByRole('button', { name: '새 회차로 만들기' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '현재 원고 끝에 붙이기' })).toBeInTheDocument()
  })
})
