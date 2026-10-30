// @vitest-environment jsdom
// Task 3: setting a chapter to done fires the infer route without waiting and ignores errors.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { ChapterRow, Role } from '@/db/types'
import { setChapterStatusAction } from '@/server/actions/chapters'
import type { WritingData } from './types'
import { WritingWorkspace } from './writing-workspace'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/chapters', () => ({
  setChapterStatusAction: vi.fn(),
  restoreChapterAction: vi.fn(),
}))

vi.mock('@/server/actions/manuscript', () => ({
  saveChapterAction: vi.fn(async () => ({ ok: true, data: { version: 2 } })),
  saveResumePointAction: vi.fn(async () => ({ ok: true, data: undefined })),
}))

vi.mock('@/lib/client/use-autosave', () => ({
  useAutosave: () => ({
    title: '제목',
    body: '본문입니다. '.repeat(50),
    setTitle: vi.fn(),
    setBody: vi.fn(),
    setComposing: vi.fn(),
    saveNow: vi.fn(async () => {}),
    replaceAll: vi.fn(),
    status: 'saved',
    version: 1,
    lastSavedAt: null,
    recoverable: null,
    recoverableStale: false,
    acceptRecovery: vi.fn(),
    discardRecovery: vi.fn(),
  }),
  flushPendingSaves: vi.fn(async () => true),
}))

vi.mock('./side-panel', () => ({
  WritingSidePanel: () => null,
}))

function makeData(): WritingData {
  return {
    workId: 'work-1',
    workTitle: '테스트 작품',
    role: 'editor' as Role,
    targetChars: 10,
    chapter: {
      id: 'c1',
      workId: 'work-1',
      position: 1,
      title: '1화',
      body: '본문입니다. '.repeat(50),
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

beforeEach(() => {
  vi.mocked(setChapterStatusAction).mockResolvedValue({ ok: true, data: {} } as never)
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify({ ok: true, data: { runId: null, proposals: [] } })),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('WritingWorkspace done trigger (s4)', () => {
  it('fires POST to the infer route once when the chapter is set to done', async () => {
    render(
      <WritingWorkspace
        data={makeData()}
        loadServerCopy={async () => ({ ok: true, data: {} }) as never}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '완료' }))
    await waitFor(() => expect(setChapterStatusAction).toHaveBeenCalled())
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/works/work-1/directives/infer',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chapterId: 'c1' }),
      }),
    )
  })

  it('shows nothing when the infer route returns 500', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 500 }))
    render(
      <WritingWorkspace
        data={makeData()}
        loadServerCopy={async () => ({ ok: true, data: {} }) as never}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '완료' }))
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('제안')
  })
})
