// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { ChapterRow, Role } from '@/db/types'
import { resetAutoChecksForTests } from '@/lib/client/auto-check'
import type { ActionResult } from '@/lib/result'
import type { ChapterCheckResult } from '@/server/chapter-check'
import type { WritingData } from './types'
import { WritingWorkspace } from './writing-workspace'

const mocks = vi.hoisted(() => ({
  postAction: vi.fn(),
  setChapterStatusAction: vi.fn(),
  saveNow: vi.fn(async () => {}),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/client/post-json', () => ({
  postAction: mocks.postAction,
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

function makeData(): WritingData {
  return {
    workId: 'w1',
    workTitle: '테스트 작품',
    role: 'editor' as Role,
    targetChars: 0,
    chapter: {
      id: 'c1',
      workId: 'w1',
      position: 4,
      title: '4화',
      body: '본문입니다. '.repeat(50),
      status: 'draft',
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

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  mocks.setChapterStatusAction.mockResolvedValue({ ok: true, data: {} })
})

afterEach(() => {
  cleanup()
  resetAutoChecksForTests()
})

describe('WritingWorkspace done auto check after unmount', () => {
  it('keeps running after the workspace unmounts', async () => {
    let resolveCheck!: (value: ActionResult<ChapterCheckResult>) => void
    mocks.postAction.mockImplementation(
      () =>
        new Promise<ActionResult<ChapterCheckResult>>((resolve) => {
          resolveCheck = resolve
        }),
    )
    const view = render(
      <WritingWorkspace
        data={makeData()}
        loadServerCopy={async () => ({ ok: true, data: {} }) as never}
      />,
    )

    const group = screen.getByRole('group', { name: '회차 상태' })
    fireEvent.click(within(group).getByRole('button', { name: '완료' }))
    await waitFor(() => expect(mocks.postAction).toHaveBeenCalledTimes(1))
    view.unmount()

    resolveCheck({
      ok: true,
      data: { issues: [], proposals: [], runIds: [], namingIssueCount: 0 },
    })

    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        '4화 점검을 마쳤습니다.',
        expect.objectContaining({ description: '지적 0건, 승인 대기 후보 0건' }),
      ),
    )
  })
})
