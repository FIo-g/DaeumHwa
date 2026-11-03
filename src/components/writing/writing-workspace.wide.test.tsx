// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import type { WritingData } from './types'
import { WritingWorkspace } from './writing-workspace'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => router,
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

// Stable across renders: a fresh setBody per render would make WorkspaceApi change every render,
// and the check panel's highlight effect would loop.
const autosave = vi.hoisted(() => ({
  title: '제목',
  body: '본문입니다.',
  setTitle: () => {},
  setBody: () => {},
  setComposing: () => {},
  saveNow: async () => {},
  replaceAll: () => {},
  status: 'saved',
  version: 1,
  lastSavedAt: null,
  recoverable: null,
  recoverableStale: false,
  acceptRecovery: () => {},
  discardRecovery: () => {},
}))

vi.mock('@/lib/client/use-autosave', () => ({
  useAutosave: () => autosave,
}))

vi.mock('@/server/actions/issues', () => ({
  resolveIssueAction: vi.fn(),
  reopenIssueAction: vi.fn(),
}))

vi.mock('@/server/actions/proposals', () => ({
  listProposalsAction: vi.fn(async () => ({ ok: true, data: [] })),
  bulkApproveAction: vi.fn(),
  approveProposalAction: vi.fn(),
  rejectProposalAction: vi.fn(),
}))

vi.mock('@/server/actions/wiki', () => ({
  updateFactAction: vi.fn(),
  supersedeFactAction: vi.fn(),
}))

vi.mock('./panels/related-cards', () => ({ RelatedCards: () => null }))
vi.mock('./panels/open-threads', () => ({ OpenThreads: () => null }))
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
      body: '본문입니다.',
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

type CheckCall = { aborted: boolean; completed: boolean }
const checkCalls: CheckCall[] = []

beforeEach(() => {
  window.sessionStorage.clear()
  checkCalls.length = 0
  // Wide layout: the side panel sits beside the editor.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/check')) {
        const call: CheckCall = { aborted: false, completed: false }
        checkCalls.push(call)
        return new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => {
            call.completed = true
            resolve(
              new Response(
                JSON.stringify({
                  ok: true,
                  data: { issues: [], proposals: [], runIds: [], namingIssueCount: 0 },
                }),
              ),
            )
          }, 40)
          init?.signal?.addEventListener('abort', () => {
            call.aborted = true
            clearTimeout(timer)
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            data: { issues: [], proposals: [], runIds: [], namingIssueCount: 0 },
          }),
        ),
      )
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('WritingWorkspace wide layout', () => {
  it('issues only one check request when the auto check is on', async () => {
    render(
      <WritingWorkspace
        data={makeData()}
        loadServerCopy={async () => ({ ok: true, data: {} }) as never}
        autoCheck
      />,
    )

    expect(await screen.findByRole('region', { name: '회차 점검' })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(checkCalls).toHaveLength(1)
    expect(checkCalls[0]).toMatchObject({ aborted: false, completed: true })
  })
})
