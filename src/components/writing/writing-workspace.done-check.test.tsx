// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { ChapterRow, ChapterStatus, Role } from '@/db/types'
import type { WritingData } from './types'
import { WritingWorkspace } from './writing-workspace'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  startAutoCheck: vi.fn(() => true),
  setChapterStatusAction: vi.fn(),
  saveNow: vi.fn(async () => {}),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/client/auto-check', () => ({
  startAutoCheck: mocks.startAutoCheck,
  useAutoCheck: () => ({ running: false, elapsedSec: 0, result: null }),
  cancelAutoCheck: vi.fn(),
}))

vi.mock('@/server/actions/chapters', () => ({
  setChapterStatusAction: mocks.setChapterStatusAction,
  restoreChapterAction: vi.fn(),
}))

vi.mock('@/server/actions/manuscript', () => ({
  saveChapterAction: vi.fn(async () => ({ ok: true, data: { version: 2 } })),
  saveResumePointAction: vi.fn(async () => ({ ok: true, data: undefined })),
}))

vi.mock('@/lib/client/use-autosave', () => ({
  useAutosave: () => ({
    title: '제목',
    body: '본문입니다.',
    setTitle: () => {},
    setBody: () => {},
    setComposing: () => {},
    saveNow: mocks.saveNow,
    replaceAll: () => {},
    status: 'saved',
    version: 1,
    lastSavedAt: null,
    recoverable: null,
    recoverableStale: false,
    acceptRecovery: () => {},
    discardRecovery: () => {},
  }),
}))

vi.mock('./side-panel', () => ({
  WritingSidePanel: () => null,
}))

function makeData(
  overrides: { status?: ChapterStatus; targetChars?: number; body?: string } = {},
): WritingData {
  return {
    workId: 'w1',
    workTitle: '테스트 작품',
    role: 'editor' as Role,
    targetChars: overrides.targetChars ?? 0,
    chapter: {
      id: 'c1',
      workId: 'w1',
      position: 4,
      title: '4화',
      body: overrides.body ?? '본문입니다. '.repeat(50),
      status: overrides.status ?? 'draft',
      version: 1,
      archivedAt: null,
    } as unknown as ChapterRow,
    chapters: [{ id: 'c1', position: 4, title: '4화' }],
    entries: [],
    namingRules: [],
    threads: [],
    issues: [],
    comments: [],
    pendingProposalCount: 0,
  }
}

function statusButton(name: '초안' | '완료') {
  const group = screen.getByRole('group', { name: '회차 상태' })
  return within(group).getByRole('button', { name })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  mocks.setChapterStatusAction.mockResolvedValue({ ok: true, data: {} })
})

afterEach(() => {
  cleanup()
})

describe('WritingWorkspace done auto check', () => {
  it('saves, marks done, then starts the auto check', async () => {
    render(
      <WritingWorkspace
        data={makeData()}
        loadServerCopy={async () => ({ ok: true, data: {} }) as never}
      />,
    )

    fireEvent.click(statusButton('완료'))

    await waitFor(() => expect(mocks.startAutoCheck).toHaveBeenCalledTimes(1))
    expect(mocks.setChapterStatusAction).toHaveBeenCalledWith({ chapterId: 'c1', status: 'done' })
    expect(mocks.startAutoCheck).toHaveBeenCalledWith(
      expect.objectContaining({ workId: 'w1', chapterId: 'c1', position: 4 }),
    )

    const statusOrder = mocks.setChapterStatusAction.mock.invocationCallOrder[0]
    // A blur can trigger its own save; take the last save before the status action.
    const saveOrder = mocks.saveNow.mock.invocationCallOrder
      .filter((order) => order < statusOrder)
      .at(-1)
    const checkOrder = mocks.startAutoCheck.mock.invocationCallOrder[0]
    expect(saveOrder).toBeDefined()
    if (saveOrder === undefined) throw new Error('applyStatus did not save')
    expect(saveOrder).toBeLessThan(statusOrder)
    expect(statusOrder).toBeLessThan(checkOrder)
  })

  it('starts the auto check after the short-draft confirmation', async () => {
    render(
      <WritingWorkspace
        data={makeData({ targetChars: 5000, body: '짧은 본문입니다.' })}
        loadServerCopy={async () => ({ ok: true, data: {} }) as never}
      />,
    )

    fireEvent.click(statusButton('완료'))

    const dialog = await screen.findByRole('alertdialog')
    expect(mocks.startAutoCheck).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '완료하기' }))
    await waitFor(() => expect(mocks.startAutoCheck).toHaveBeenCalledTimes(1))
  })

  it('does not start a check when the status change fails', async () => {
    mocks.setChapterStatusAction.mockResolvedValue({
      ok: false,
      error: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
    })
    render(
      <WritingWorkspace
        data={makeData()}
        loadServerCopy={async () => ({ ok: true, data: {} }) as never}
      />,
    )

    fireEvent.click(statusButton('완료'))

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith('권한이 없습니다.'))
    expect(mocks.startAutoCheck).not.toHaveBeenCalled()
  })

  it('does not start a check when a done chapter goes back to draft', async () => {
    render(
      <WritingWorkspace
        data={makeData({ status: 'done' })}
        loadServerCopy={async () => ({ ok: true, data: {} }) as never}
      />,
    )

    fireEvent.click(statusButton('초안'))

    await waitFor(() =>
      expect(mocks.setChapterStatusAction).toHaveBeenCalledWith({
        chapterId: 'c1',
        status: 'draft',
      }),
    )
    expect(mocks.startAutoCheck).not.toHaveBeenCalled()
  })
})
