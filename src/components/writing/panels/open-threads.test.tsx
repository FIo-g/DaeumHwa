// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/db/types'
import { addThreadEventAction } from '@/server/actions/threads'
import type { ThreadItem } from '@/components/threads/thread-types'
import type { WorkspaceApi, WritingData } from '../types'
import { OpenThreads } from './open-threads'

vi.mock('@/server/actions/threads', () => ({
  addThreadEventAction: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const addEvent = vi.mocked(addThreadEventAction)

function makeThread(overrides: Partial<ThreadItem>): ThreadItem {
  return {
    id: 't1',
    title: '낡은 편지',
    description: '',
    status: 'planned',
    importance: 'major',
    plantedChapterId: null,
    plantedPosition: null,
    targetChapterPosition: null,
    overdue: false,
    relatedEntries: [],
    events: [],
    ...overrides,
  } as ThreadItem
}

/** The chapter is 2화 in every case. */
function makeData(role: Role, thread: ThreadItem): WritingData {
  return {
    workId: 'work-1',
    workTitle: '테스트 작품',
    role,
    demo: false,
    targetChars: 5500,
    chapter: { id: 'c2', position: 2, archivedAt: null, title: '2화' } as never,
    chapters: [{ id: 'c2', position: 2, title: '2화' }],
    entries: [],
    namingRules: [],
    threads: [thread],
    issues: [],
    comments: [],
    pendingProposalCount: 0,
  } as unknown as WritingData
}

const api = {
  getText: vi.fn(() => ''),
  refresh: vi.fn(),
} as unknown as WorkspaceApi

beforeEach(() => {
  vi.clearAllMocks()
  addEvent.mockResolvedValue({ ok: true, data: {} as never })
})

afterEach(() => {
  cleanup()
})

describe('OpenThreads', () => {
  it('offers 이 회차에 심음 for a planned thread and records it on this chapter', async () => {
    render(<OpenThreads data={makeData('editor', makeThread({ status: 'planned' }))} api={api} />)

    expect(screen.queryByRole('button', { name: '이 회차에서 발전' })).toBeNull()
    expect(screen.queryByRole('button', { name: '이 회차에서 회수' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '이 회차에 심음' }))

    await waitFor(() => expect(addEvent).toHaveBeenCalledTimes(1))
    expect(addEvent).toHaveBeenCalledWith({ threadId: 't1', kind: 'planted', chapterId: 'c2' })
  })

  it('allows 발전 on the planting chapter but not 회수 there', () => {
    render(
      <OpenThreads
        data={makeData('editor', makeThread({ status: 'planted', plantedPosition: 2 }))}
        api={api}
      />,
    )

    expect(screen.getByRole('button', { name: '이 회차에서 발전' }).hasAttribute('disabled')).toBe(
      false,
    )
    expect(screen.getByRole('button', { name: '이 회차에서 회수' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(screen.queryByRole('button', { name: '이 회차에 심음' })).toBeNull()
  })

  it('enables 발전 and 회수 after the planting chapter and records 회수', async () => {
    render(
      <OpenThreads
        data={makeData('editor', makeThread({ status: 'developing', plantedPosition: 1 }))}
        api={api}
      />,
    )

    expect(screen.getByRole('button', { name: '이 회차에서 발전' }).hasAttribute('disabled')).toBe(
      false,
    )
    fireEvent.click(screen.getByRole('button', { name: '이 회차에서 회수' }))

    await waitFor(() => expect(addEvent).toHaveBeenCalledTimes(1))
    expect(addEvent).toHaveBeenCalledWith({ threadId: 't1', kind: 'resolved', chapterId: 'c2' })
  })

  it('shows only the editor note to a viewer', () => {
    render(<OpenThreads data={makeData('viewer', makeThread({ status: 'planned' }))} api={api} />)

    expect(screen.queryByRole('button', { name: '이 회차에 심음' })).toBeNull()
    expect(screen.getByText('편집자 이상만 실행할 수 있습니다.')).toBeTruthy()
  })
})
