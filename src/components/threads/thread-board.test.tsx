// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThreadBoard } from './thread-board'
import { threadChapterCenter } from './thread-geometry'
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
    targetChapterPosition: 5,
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
  it('shows all five status filters in ledger order', () => {
    renderBoard('editor')
    const filters = screen.getAllByRole('group', { name: '떡밥 상태' })[0]
    expect(
      within(filters)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['전체', '계획됨', '심음', '발전 중', '회수', '폐기'])
  })

  it('filters ledger rows by their actual status', () => {
    renderBoard('editor')
    const filters = screen.getAllByRole('group', { name: '떡밥 상태' })[0]
    fireEvent.click(within(filters).getByRole('button', { name: '심음' }))
    expect(screen.getByRole('button', { name: /빛나는 목걸이.*심음/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /그림자 계약/ })).not.toBeInTheDocument()
    fireEvent.click(within(filters).getByRole('button', { name: '회수' }))
    expect(screen.getByRole('button', { name: /그림자 계약.*회수/ })).toBeInTheDocument()
    fireEvent.click(within(filters).getByRole('button', { name: '폐기' }))
    expect(screen.getByRole('status')).toHaveTextContent('떡밥이 없어요.')
  })

  it('shows the planted chapter, the target chapter and the overdue badge', () => {
    renderBoard('editor')
    const card = screen.getByRole('button', { name: /빛나는 목걸이/ })
    expect(within(card).getByText('심은 회차 3화')).toBeInTheDocument()
    expect(within(card).getByText('목표 5화')).toBeInTheDocument()
    expect(within(card).getByText('회수 목표 지남')).toBeInTheDocument()
    expect(within(card).getByText('서윤')).toBeInTheDocument()
  })

  it('marks an overdue thread with a plain label, not a filled badge', () => {
    renderBoard('editor')
    const card = screen.getByRole('button', { name: /빛나는 목걸이/ })
    expect(within(card).getByText('회수 목표 지남')).not.toHaveAttribute('data-slot', 'badge')
  })

  it('does not show the overdue badge for threads that are not overdue', () => {
    renderBoard('editor')
    const card = screen.getByRole('button', { name: /그림자 계약/ })
    expect(within(card).queryByText('회수 목표 지남')).not.toBeInTheDocument()
  })

  it('synchronizes the slider, axis and overdue badge', () => {
    renderBoard('editor')
    const slider = screen.getByRole('slider', { name: '기준 회차' })
    const row = screen.getByRole('button', { name: /빛나는 목걸이/ })
    expect(slider).toHaveValue('6')
    fireEvent.change(slider, { target: { value: '1' } })
    expect(screen.getByRole('button', { name: '1화', pressed: true })).toBeInTheDocument()
    expect(within(row).queryByText('회수 목표 지남')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '5화' }))
    expect(slider).toHaveValue('5')
    expect(within(row).queryByText('회수 목표 지남')).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: '5화' }), { key: 'ArrowRight' })
    expect(slider).toHaveValue('6')
    expect(within(row).getByText('회수 목표 지남')).toBeInTheDocument()
  })

  it('starts at the latest chapter and extends the axis to a future target', () => {
    render(
      <ThreadBoard
        workId="w1"
        role="viewer"
        threads={[{ ...threads[0], targetChapterPosition: 200 }]}
        chapters={chapters}
        entries={entries}
      />,
    )
    const slider = screen.getByRole('slider', { name: '기준 회차' })
    expect(slider).toHaveValue('6')
    expect(slider).toHaveAttribute('max', '200')
    expect(screen.getByRole('button', { name: '200화' })).toBeInTheDocument()
  })

  it('centers both shared-chapter markers and keeps the overdue note in the label', () => {
    render(
      <ThreadBoard
        workId="w1"
        role="viewer"
        threads={[{ ...threads[0], plantedPosition: 2, targetChapterPosition: 2 }]}
        chapters={chapters}
        entries={entries}
      />,
    )
    const row = screen.getByRole('button', { name: /빛나는 목걸이/ })
    const seed = row.querySelector('[data-thread-coincident="seed"]')
    const target = row.querySelector('[data-thread-coincident="target"]')
    const center = threadChapterCenter(2, 6, 100)
    expect(seed).toHaveStyle({ insetInlineStart: `${center}%` })
    expect(target).toHaveStyle({ insetInlineStart: `${center}%` })
    const notice = within(row).getByText('거둘 때가 지났어요')
    expect(notice.closest('.wg-threads-row-label')).not.toBeNull()
  })

  it.each([3, 6, 12, 24])(
    'uses the same %i chapter cells for ticks, rules, markers and line ends',
    (chapterCount) => {
      const { container } = render(
        <ThreadBoard
          workId="w1"
          role="viewer"
          threads={[{ ...threads[0], plantedPosition: 1, targetChapterPosition: chapterCount }]}
          chapters={[{ id: 'c1', position: chapterCount - 1, title: '' }]}
          entries={entries}
        />,
      )
      const from = threadChapterCenter(1, chapterCount, 100)
      const to = threadChapterCenter(chapterCount, chapterCount, 100)
      const space = screen.getByRole('region', { name: '떡밥 회차 축' })
      const ticks = within(space).getByRole('group', { name: '기준 회차' })
      expect(within(ticks).getAllByRole('button')).toHaveLength(chapterCount)
      expect(within(ticks).getByRole('button', { name: `${chapterCount}화` })).toHaveAttribute(
        'data-future',
        'true',
      )
      expect(container.querySelectorAll('.wg-threads-ledger-rules > span')).toHaveLength(
        chapterCount,
      )
      expect(container.querySelector('.wg-threads-timeline')).toHaveStyle(
        `--wg-threads-chapters: ${chapterCount}`,
      )
      const row = within(space).getByRole('button', { name: /빛나는 목걸이/ })
      expect(row.querySelector('.wg-threads-seed')).toHaveStyle({ insetInlineStart: `${from}%` })
      expect(row.querySelector('.wg-threads-target')).toHaveStyle({ insetInlineStart: `${to}%` })
      const line = row.querySelector<HTMLElement>('.wg-threads-line')!
      expect(Number.parseFloat(line.style.insetInlineStart)).toBeCloseTo(from)
      expect(Number.parseFloat(line.style.insetInlineEnd.replace('calc(', ''))).toBeCloseTo(
        100 - to,
      )
    },
  )

  it('offers 새 떡밥 to editors and owners', () => {
    renderBoard('editor')
    expect(screen.getByRole('button', { name: '새 떡밥' })).toBeInTheDocument()
  })

  it('hides 새 떡밥 from viewers', () => {
    renderBoard('viewer')
    expect(screen.queryByRole('button', { name: '새 떡밥' })).not.toBeInTheDocument()
  })
})
