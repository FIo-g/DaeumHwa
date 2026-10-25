// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import type { DraftRefinePreview } from '@/lib/draft-refine'
import { applyDraftRefinementAction } from '@/server/actions/ai-features'
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
  applyDraftRefinementAction: vi.fn(),
  recordDraftUseAction: vi.fn(),
}))

const encoder = new TextEncoder()

const PREVIEW: DraftRefinePreview = {
  runId: 'run-1',
  token: 'token-1',
  changed: true,
  parts: [
    { type: 'delete', value: '원래 ' },
    { type: 'insert', value: '다듬은 ' },
    { type: 'equal', value: '초안입니다.' },
  ],
  paragraphsBefore: 1,
  paragraphsAfter: 0,
  flagged: 0,
  repaired: 0,
  repairState: 'none',
  beforeChars: 10,
  afterChars: 10,
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

/** A stream that sends `text` and closes: a complete draft. */
function fullStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

/** A stream that sends `text`, then fails on the next read: a stopped draft. */
function brokenStream(text: string): ReadableStream<Uint8Array> {
  let sent = false
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) {
        sent = true
        controller.enqueue(encoder.encode(text))
        return
      }
      controller.error(new Error('stream broke'))
    },
  })
}

function draftResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { headers: { 'X-Run-Id': 'run-1' } })
}

function refineResponse(preview: DraftRefinePreview = PREVIEW): Response {
  return new Response(JSON.stringify({ ok: true, data: preview }), {
    headers: { 'content-type': 'application/json' },
  })
}

// The draft panel starts the stage 3 check once a draft finishes; an empty result keeps the
// panel on the refine flow these tests cover.
function checkResponse(): Response {
  return new Response(
    JSON.stringify({ ok: true, data: { findings: [], fix: null, notice: null } }),
    {
      headers: { 'content-type': 'application/json' },
    },
  )
}

function renderPanel() {
  const api = makeApi()
  render(<DraftPanel data={makeData()} api={api} />)
  return { api }
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

describe('DraftPanel 다듬기', () => {
  it('offers 다듬기 only after a complete draft', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(draftResponse(brokenStream('중간에 멈춘 글')))
    renderPanel()

    startDraft()
    await screen.findByText('중간에 멈춘 초안입니다.')
    expect(screen.queryByRole('button', { name: '다듬기' })).toBeNull()

    vi.mocked(fetch).mockResolvedValueOnce(draftResponse(fullStream('완성된 초안입니다.')))
    startDraft()
    expect(await screen.findByRole('button', { name: '다듬기' })).toBeTruthy()
  })

  it('disables the append and new-chapter buttons while a preview is open', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(draftResponse(fullStream('원래 초안입니다.')))
      .mockResolvedValueOnce(checkResponse())
      .mockResolvedValueOnce(refineResponse())
    renderPanel()
    startDraft()
    fireEvent.click(await screen.findByRole('button', { name: '다듬기' }))
    await screen.findByRole('region', { name: '다듬기 미리보기' })

    const append = screen.getByRole('button', { name: '현재 원고 끝에 붙이기' })
    const create = screen.getByRole('button', { name: '새 회차로 만들기' })
    expect((append as HTMLButtonElement).disabled).toBe(true)
    expect((create as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '버리기' }))

    expect(
      (screen.getByRole('button', { name: '현재 원고 끝에 붙이기' }) as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(
      (screen.getByRole('button', { name: '새 회차로 만들기' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('applies the refined text to the draft, so appending uses it', async () => {
    vi.mocked(applyDraftRefinementAction).mockResolvedValue({
      ok: true,
      data: { runId: 'run-1', text: '다듬은 초안입니다.' },
    })
    vi.mocked(fetch)
      .mockResolvedValueOnce(draftResponse(fullStream('원래 초안입니다.')))
      .mockResolvedValueOnce(checkResponse())
      .mockResolvedValueOnce(refineResponse())
    const { api } = renderPanel()
    startDraft()
    fireEvent.click(await screen.findByRole('button', { name: '다듬기' }))
    await screen.findByRole('region', { name: '다듬기 미리보기' })

    fireEvent.click(screen.getByRole('button', { name: '적용' }))

    const draftRegion = await screen.findByRole('region', { name: 'AI 초안 미리보기' })
    await waitFor(() => expect(draftRegion.textContent).toBe('다듬은 초안입니다.'))

    fireEvent.click(screen.getByRole('button', { name: '현재 원고 끝에 붙이기' }))
    expect(api.appendText).toHaveBeenCalledWith('다듬은 초안입니다.')
  })

  it('hides 다듬기 once the draft was appended', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(draftResponse(fullStream('원래 초안입니다.')))
    renderPanel()
    startDraft()
    fireEvent.click(await screen.findByRole('button', { name: '현재 원고 끝에 붙이기' }))

    expect(screen.queryByRole('button', { name: '다듬기' })).toBeNull()
  })

  it('a new draft clears an open preview and re-enables the buttons', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(draftResponse(fullStream('원래 초안입니다.')))
      .mockResolvedValueOnce(checkResponse())
      .mockResolvedValueOnce(refineResponse())
      .mockResolvedValueOnce(draftResponse(fullStream('두 번째 초안입니다.')))
    renderPanel()
    startDraft()
    fireEvent.click(await screen.findByRole('button', { name: '다듬기' }))
    await screen.findByRole('region', { name: '다듬기 미리보기' })

    startDraft('두 번째 장면을 쓴다.')
    await screen.findByText('두 번째 초안입니다.')

    expect(screen.queryByRole('region', { name: '다듬기 미리보기' })).toBeNull()
    expect(
      (screen.getByRole('button', { name: '현재 원고 끝에 붙이기' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})
