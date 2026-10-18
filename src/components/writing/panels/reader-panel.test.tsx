// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import type { WorkspaceApi, WritingData } from '../types'
import { ReaderPanel } from './reader-panel'

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

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

function makeApi() {
  return {
    getText: vi.fn(() => '본문'),
    replaceRange: vi.fn(),
    replaceQuote: vi.fn(() => true),
    appendText: vi.fn(),
    setHighlights: vi.fn(),
    focusRange: vi.fn(),
    getSelection: vi.fn(() => null),
    saveNow: vi.fn(async () => {}),
    refresh: vi.fn(),
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ReaderPanel', () => {
  it('runs the reader simulation through its route with the chosen personas', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}))
    const api = makeApi()
    render(<ReaderPanel data={makeData()} api={api as unknown as WorkspaceApi} text="본문" />)

    fireEvent.click(screen.getByRole('button', { name: '독자 반응 보기' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/works/work-1/chapters/c1/reader-sim')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      personaIds: ['reader-novice', 'reader-binge', 'reader-casual', 'reader-genre'],
    })
    expect(api.saveNow).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '읽는 중… (AI)' })).toBeTruthy()
  })
})
