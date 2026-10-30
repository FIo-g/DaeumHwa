// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import { draftReplaceRecord } from '@/lib/draft-stream'
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
const FILLING_NOTE = '분량을 채우는 중'

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

/** A stream that sends each part in order, then closes. */
function partsStream(parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
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

function startDraft() {
  fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), {
    target: { value: '주인공이 성문을 연다.' },
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

describe('DraftPanel with a replaced draft', () => {
  it('tells the server it understands the replace record', async () => {
    vi.mocked(fetch).mockResolvedValue(draftResponse(partsStream(['첫 글'])))
    render(<DraftPanel data={makeData()} api={makeApi()} />)
    startDraft()

    await screen.findByRole('region', { name: 'AI 초안 미리보기' })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ acceptsReplace: true })
  })

  it('shows the replaced text after the stream ends', async () => {
    vi.mocked(fetch).mockResolvedValue(
      draftResponse(partsStream(['첫 글', draftReplaceRecord('바뀐 글')])),
    )
    render(<DraftPanel data={makeData()} api={makeApi()} />)
    startDraft()

    const preview = await screen.findByRole('region', { name: 'AI 초안 미리보기' })
    await waitFor(() => expect(preview).toHaveTextContent('바뀐 글'))
    expect(preview).not.toHaveTextContent('첫 글')
    expect(screen.queryByText(FILLING_NOTE)).not.toBeInTheDocument()
  })

  it('shows the filling note after 3 seconds without new text', async () => {
    vi.mocked(fetch).mockResolvedValue(draftResponse(openStream('첫 글')))
    render(<DraftPanel data={makeData()} api={makeApi()} />)
    startDraft()

    expect(await screen.findByText(FILLING_NOTE, {}, { timeout: 4500 })).toBeInTheDocument()
  }, 10000)
})
