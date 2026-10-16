// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThreadBoard } from './thread-board'
import type { ChapterOption, EntryOption, ThreadItem } from './thread-types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/server/actions/threads', () => ({
  createThreadAction: vi.fn(),
  updateThreadAction: vi.fn(),
  addThreadEventAction: vi.fn(),
  archiveThreadAction: vi.fn(),
  archiveThreadEventAction: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

const chapters: ChapterOption[] = [
  { id: 'c1', position: 1, title: '시작' },
  { id: 'c3', position: 3, title: '' },
  { id: 'c6', position: 6, title: '' },
]

const entries: EntryOption[] = [{ id: 'e1', name: '서윤', kind: 'character' }]

const threads: ThreadItem[] = [
  {
    id: 't1',
    title: '빛나는 목걸이',
    description: '',
    status: 'planted',
    importance: 'high',
    plantedChapterId: 'c3',
    plantedPosition: 3,
    targetChapterPosition: 6,
    overdue: true,
    relatedEntries: [{ id: 'e1', name: '서윤' }],
    events: [],
  },
  {
    id: 't2',
    title: '잊힌 편지',
    description: '',
    status: 'planned',
    importance: 'low',
    plantedChapterId: null,
    plantedPosition: null,
    targetChapterPosition: null,
    overdue: false,
    relatedEntries: [],
    events: [],
  },
  {
    id: 't3',
    title: '그림자 계약',
    description: '',
    status: 'resolved',
    importance: 'medium',
    plantedChapterId: 'c1',
    plantedPosition: 1,
    targetChapterPosition: null,
    overdue: false,
    relatedEntries: [],
    events: [],
  },
]

function renderBoard(role: 'owner' | 'editor' | 'viewer') {
  return render(
    <ThreadBoard workId="w1" role={role} threads={threads} chapters={chapters} entries={entries} />,
  )
}

describe('ThreadBoard', () => {
  it('shows the five status columns in ledger order', () => {
    renderBoard('editor')
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((h) => h.querySelector('[data-slot="column-label"]')?.textContent)).toEqual(
      ['계획됨', '심음', '발전 중', '회수', '폐기'],
    )
  })

  it('puts each thread in the column of its status', () => {
    renderBoard('editor')
    const planted = screen.getByRole('region', { name: '심음' })
    expect(within(planted).getByText('빛나는 목걸이')).toBeInTheDocument()
    const resolved = screen.getByRole('region', { name: '회수' })
    expect(within(resolved).getByText('그림자 계약')).toBeInTheDocument()
  })

  it('shows the planted chapter, the target chapter and the overdue badge', () => {
    renderBoard('editor')
    const card = screen.getByRole('button', { name: /빛나는 목걸이/ })
    expect(within(card).getByText('심은 회차 3화')).toBeInTheDocument()
    expect(within(card).getByText('목표 6화')).toBeInTheDocument()
    expect(within(card).getByText('회수 목표 지남')).toBeInTheDocument()
    expect(within(card).getByText('서윤')).toBeInTheDocument()
  })

  it('does not show the overdue badge for threads that are not overdue', () => {
    renderBoard('editor')
    const card = screen.getByRole('button', { name: /그림자 계약/ })
    expect(within(card).queryByText('회수 목표 지남')).not.toBeInTheDocument()
  })

  it('offers 새 떡밥 to editors and owners', () => {
    renderBoard('editor')
    expect(screen.getByRole('button', { name: '새 떡밥' })).toBeInTheDocument()
  })

  it('hides 새 떡밥 from viewers', () => {
    renderBoard('viewer')
    expect(screen.queryByRole('button', { name: '새 떡밥' })).not.toBeInTheDocument()
  })
})
