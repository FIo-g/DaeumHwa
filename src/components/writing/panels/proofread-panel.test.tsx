// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { ChapterRow, Role } from '@/db/types'
import type { WorkspaceApi, WritingData } from '../types'
import { ProofreadPanel } from './proofread-panel'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

// Two rule fixes: "되요" at 0 and at 4 in "되요 되요." (both become "돼요").
const TEXT = '되요 되요.'

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
      body: TEXT,
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

/** An editor whose text really changes, so the apply and undo paths can be checked. */
function makeTextApi(initial: string) {
  let text = initial
  const api = {
    getText: vi.fn(() => text),
    replaceRange: vi.fn((start: number, end: number, replacement: string) => {
      text = text.slice(0, start) + replacement + text.slice(end)
    }),
    replaceQuote: vi.fn((quote: string, replacement: string, hintStart?: number) => {
      const index = text.indexOf(quote, hintStart ?? 0)
      if (index < 0) return false
      text = text.slice(0, index) + replacement + text.slice(index + quote.length)
      return true
    }),
    appendText: vi.fn(),
    setHighlights: vi.fn(),
    focusRange: vi.fn(),
    getSelection: vi.fn(() => null),
    saveNow: vi.fn(async () => {}),
    refresh: vi.fn(),
  }
  return api
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast).mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProofreadPanel', () => {
  it('undoes 모두 적용 (규칙) in one step from the toast', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ok: true,
        data: {
          runId: null,
          suggestions: [
            {
              source: 'rule',
              quote: '되요',
              replacement: '돼요',
              kind: 'spelling',
              reason: '맞춤법',
              start: 0,
              end: 2,
            },
            {
              source: 'rule',
              quote: '되요',
              replacement: '돼요',
              kind: 'spelling',
              reason: '맞춤법',
              start: 3,
              end: 5,
            },
          ],
        },
      }),
    )
    const api = makeTextApi(TEXT)
    render(<ProofreadPanel data={makeData()} api={api as unknown as WorkspaceApi} text={TEXT} />)

    fireEvent.click(screen.getByRole('button', { name: '규칙 검사' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '모두 적용 (규칙)' })))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/works/work-1/chapters/c1/proofread')

    fireEvent.click(screen.getByRole('button', { name: '모두 적용 (규칙)' }))
    expect(api.getText()).toBe('돼요 돼요.')

    const calls = vi.mocked(toast).mock.calls
    const options = calls[calls.length - 1][1] as unknown as { action: { onClick: () => void } }
    options.action.onClick()
    expect(api.getText()).toBe(TEXT)
  })
})
