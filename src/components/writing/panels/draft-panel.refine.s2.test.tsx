// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import type { DraftRefinePreview } from '@/lib/draft-refine'
import { applyDraftRefinementAction, draftFindingsAction } from '@/server/actions/ai-features'
import type { WorkspaceApi, WritingData } from '../types'
import { DraftPanel } from './draft-panel'

// Stage 2 review fixes, group C (C4): once 다듬기 replaces the draft, the findings of the old draft
// are dropped from the panel.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/ai-features', () => ({
  createChapterFromDraftAction: vi.fn(),
  applyDraftRefinementAction: vi.fn(),
  draftFindingsAction: vi.fn(),
  planDraftAction: vi.fn(),
  recordDraftUseAction: vi.fn(),
}))

const encoder = new TextEncoder()

const PREVIEW: DraftRefinePreview = {
  runId: 'run-1',
  token: 'token-1',
  changed: true,
  parts: [
    { type: 'delete', value: '입꼬리가 ' },
    { type: 'equal', value: '올라갔다.' },
  ],
  paragraphsBefore: 1,
  paragraphsAfter: 1,
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

function fullStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
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
// panel on the refine flow this test covers.
function checkResponse(): Response {
  return new Response(
    JSON.stringify({ ok: true, data: { findings: [], fix: null, notice: null } }),
    {
      headers: { 'content-type': 'application/json' },
    },
  )
}

function startDraft(instructions = '주인공이 성문을 연다.') {
  fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), {
    target: { value: instructions },
  })
  fireEvent.click(screen.getByRole('button', { name: '바로 쓰기' }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(draftFindingsAction).mockResolvedValue({
    ok: true,
    data: {
      findings: [{ directiveId: 'ban', kind: 'ban', count: 2, paragraphs: [0, 1] }],
      directives: [
        {
          id: 'ban',
          scope: 'work',
          kind: 'ban',
          text: '입꼬리를 쓰지 않는다.',
          pattern: '입꼬리',
          speechLevel: null,
          targetChars: null,
          chapterPosition: null,
          entryId: null,
          entryName: null,
        },
      ],
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('DraftPanel findings after 다듬기', () => {
  it('drops the findings of the old draft once the refined draft replaces it', async () => {
    vi.mocked(applyDraftRefinementAction).mockResolvedValue({
      ok: true,
      data: { runId: 'run-1', text: '웃음이 올라갔다.' },
    })
    vi.mocked(fetch)
      .mockResolvedValueOnce(draftResponse(fullStream('입꼬리가 올라갔다. 입꼬리를 내렸다.')))
      .mockResolvedValueOnce(checkResponse())
      .mockResolvedValueOnce(refineResponse())
    render(<DraftPanel data={makeData()} api={makeApi()} />)

    startDraft()
    expect(await screen.findByText("'입꼬리' 2곳")).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: '다듬기' }))
    await screen.findByRole('region', { name: '다듬기 미리보기' })

    fireEvent.click(screen.getByRole('button', { name: '적용' }))

    const draftRegion = await screen.findByRole('region', { name: 'AI 초안 미리보기' })
    await waitFor(() => expect(draftRegion.textContent).toBe('웃음이 올라갔다.'))
    expect(screen.queryByText("'입꼬리' 2곳")).toBeNull()
  })
})
