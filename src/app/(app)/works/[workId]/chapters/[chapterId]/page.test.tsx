// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  workspace: vi.fn<(props: { userId?: string }) => null>(() => null),
  loadWritingData: vi.fn(),
  pageContext: vi.fn(),
}))

vi.mock('@/components/writing/writing-workspace', () => ({
  WritingWorkspace: mocks.workspace,
}))
vi.mock('@/server/page-helpers', () => ({
  pageContext: mocks.pageContext,
  guardPage: <T,>(fn: () => Promise<T>) => fn(),
}))
vi.mock('./writing-data', () => ({ loadWritingData: mocks.loadWritingData }))
vi.mock('./actions', () => ({ loadChapterAction: vi.fn() }))

import ChapterWritingPage from './page'

const chapter = { id: 'chapter-1', position: 3, title: '숨은 계약', body: '', version: 1 }

async function renderPage() {
  const element = await ChapterWritingPage({
    params: Promise.resolve({ workId: 'work-1', chapterId: 'chapter-1' }),
  })
  return render(element)
}

beforeEach(() => {
  mocks.workspace.mockClear()
  mocks.loadWritingData.mockReset().mockResolvedValue({
    workId: 'work-1',
    workTitle: '별빛 계약',
    chapter,
  })
  mocks.pageContext.mockReset().mockResolvedValue({
    db: {},
    actor: { userId: 'user-1' },
    user: { id: 'user-1', name: '작가', email: 'writer@test.local' },
  })
})

afterEach(() => {
  cleanup()
})

describe('ChapterWritingPage', () => {
  it('passes the signed-in user id to the writing workspace so device drafts are kept per user', async () => {
    await renderPage()

    expect(mocks.workspace).toHaveBeenCalledTimes(1)
    expect(mocks.workspace.mock.calls[0]?.[0].userId).toBe('user-1')
  })

  it('shows the chapter heading and the work title', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('숨은 계약')
    expect(screen.getByText('별빛 계약')).toBeInTheDocument()
  })
})
