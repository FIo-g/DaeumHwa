// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addThreadEventAction } from '@/server/actions/threads'
import { ThreadEventForm } from './thread-event-form'
import type { ChapterOption, ThreadItem } from './thread-types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/server/actions/threads', () => ({
  addThreadEventAction: vi.fn(),
}))

const action = vi.mocked(addThreadEventAction)

const chapters: ChapterOption[] = [
  { id: 'c1', position: 1, title: '시작' },
  { id: 'c3', position: 3, title: '' },
  { id: 'c6', position: 6, title: '' },
]

function thread(overrides: Partial<ThreadItem>): ThreadItem {
  return {
    id: 't1',
    title: '빛나는 목걸이',
    description: '',
    status: 'planted',
    importance: 'high',
    plantedChapterId: 'c3',
    plantedPosition: 3,
    targetChapterPosition: null,
    overdue: false,
    relatedEntries: [],
    events: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('ThreadEventForm', () => {
  it('offers 심음 for a thread that is still only planned', () => {
    render(
      <ThreadEventForm
        thread={thread({ status: 'planned', plantedChapterId: null, plantedPosition: null })}
        chapters={chapters}
      />,
    )
    expect(screen.getByLabelText('기록 종류')).toHaveTextContent('심음')
  })

  it('starts with 발전 for a planted thread', () => {
    render(<ThreadEventForm thread={thread({})} chapters={chapters} />)
    expect(screen.getByLabelText('기록 종류')).toHaveTextContent('발전')
  })

  it('offers only 메모 for a resolved thread', () => {
    render(
      <ThreadEventForm
        thread={thread({ status: 'resolved', plantedPosition: 3 })}
        chapters={chapters}
      />,
    )
    expect(screen.getByLabelText('기록 종류')).toHaveTextContent('메모')
  })

  it('shows the service error inline when the record is refused', async () => {
    action.mockResolvedValue({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: '발전 기록은 떡밥을 심은 회차(3화) 이후여야 합니다.',
      },
    })
    render(<ThreadEventForm thread={thread({})} chapters={chapters} />)
    fireEvent.click(screen.getByRole('button', { name: '기록 추가' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('발전 기록은 떡밥을 심은 회차(3화) 이후여야 합니다.')
    expect(action).toHaveBeenCalledWith({
      threadId: 't1',
      kind: 'developed',
      chapterId: 'c6',
      note: '',
      evidence: '',
    })
  })

  it('sends no error when the record is saved', async () => {
    action.mockResolvedValue({
      ok: true,
      data: {} as never,
    })
    render(<ThreadEventForm thread={thread({})} chapters={chapters} />)
    fireEvent.click(screen.getByRole('button', { name: '기록 추가' }))

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
