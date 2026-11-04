// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import { useAutoCheck } from '@/lib/client/auto-check'
import { WritingSidePanel } from './side-panel'
import type { WritingData } from './types'

vi.mock('@/lib/client/auto-check', () => ({
  useAutoCheck: vi.fn(),
  cancelAutoCheck: vi.fn(),
  startAutoCheck: vi.fn(),
}))

vi.mock('./panels/related-cards', () => ({ RelatedCards: () => null }))
vi.mock('./panels/open-threads', () => ({ OpenThreads: () => null }))
vi.mock('./panels/check-panel', () => ({ CheckPanel: () => null }))
vi.mock('./panels/proofread-panel', () => ({ ProofreadPanel: () => null }))
vi.mock('./panels/comments-panel', () => ({ CommentsPanel: () => null }))
vi.mock('./panels/draft-panel', () => ({ DraftPanel: () => null }))
vi.mock('./panels/reader-panel', () => ({ ReaderPanel: () => null }))

function makeData(): WritingData {
  return {
    workId: 'work-1',
    workTitle: '테스트 작품',
    role: 'editor' as Role,
    targetChars: 5500,
    chapter: {
      id: 'c1',
      workId: 'work-1',
      position: 3,
      title: '3화',
      body: '',
      status: 'draft',
      version: 1,
      archivedAt: null,
    } as unknown as ChapterRow,
    chapters: [{ id: 'c1', position: 3, title: '3화' }],
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
    getText: vi.fn((): string => ''),
    replaceRange: vi.fn(),
    replaceQuote: vi.fn((): boolean => true),
    appendText: vi.fn(),
    setHighlights: vi.fn(),
    focusRange: vi.fn(),
    getSelection: vi.fn(() => null),
    saveNow: vi.fn(async () => {}),
    refresh: vi.fn(),
  }
}

function renderPanel() {
  return render(<WritingSidePanel data={makeData()} api={makeApi()} text="" position={3} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('WritingSidePanel auto check', () => {
  it('switches to the check tab when an auto check starts', () => {
    vi.mocked(useAutoCheck).mockReturnValue({ running: false, elapsedSec: 0 })
    const { rerender } = renderPanel()

    expect(screen.getByRole('tab', { name: '관련 카드', selected: true })).toBeInTheDocument()

    vi.mocked(useAutoCheck).mockReturnValue({ running: true, elapsedSec: 1 })
    rerender(<WritingSidePanel data={makeData()} api={makeApi()} text="" position={3} />)

    expect(screen.getByRole('tab', { name: '점검', selected: true })).toBeInTheDocument()
  })
})
