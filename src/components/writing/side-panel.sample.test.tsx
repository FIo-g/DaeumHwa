// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import { markSampleChapter } from '@/lib/client/sample-session'
import { WritingSidePanel } from './side-panel'
import type { WritingData } from './types'

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
      id: 'c3',
      workId: 'work-1',
      position: 3,
      title: '3화',
      body: '',
      status: 'draft',
      version: 1,
      archivedAt: null,
    } as unknown as ChapterRow,
    chapters: [{ id: 'c3', position: 3, title: '3화' }],
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

function renderPanel(autoCheck?: boolean) {
  return render(
    <WritingSidePanel
      data={makeData()}
      api={makeApi()}
      text=""
      position={3}
      autoCheck={autoCheck}
    />,
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('WritingSidePanel initial tab', () => {
  it('opens the check tab when the auto check is on', () => {
    renderPanel(true)

    expect(screen.getByRole('tab', { name: '점검', selected: true })).toBeInTheDocument()
  })

  it('opens the check tab when the tab is marked as a sample', () => {
    markSampleChapter('c3')
    renderPanel(false)

    expect(screen.getByRole('tab', { name: '점검', selected: true })).toBeInTheDocument()
  })

  it('opens the related cards tab otherwise', () => {
    renderPanel(false)

    expect(screen.getByRole('tab', { name: '관련 카드', selected: true })).toBeInTheDocument()
  })
})
