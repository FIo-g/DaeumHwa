// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EntryList } from './entry-list'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

const entries = [
  {
    id: 'e1',
    kind: 'character' as const,
    name: '서윤',
    aliases: ['윤'],
    summary: '검을 쓰는 주인공',
    factCount: 3,
  },
  { id: 'e2', kind: 'character' as const, name: '도현', aliases: [], summary: '', factCount: 0 },
]

const base = {
  workId: 'w1',
  kinds: ['character' as const],
  defaultKind: 'character' as const,
  query: '',
  kindFilter: null,
  tab: 'characters',
}

describe('EntryList', () => {
  it('shows each card with its aliases, summary and fact count, linked to its detail page', () => {
    render(<EntryList {...base} entries={entries} canEdit />)
    const card = screen.getByRole('link', { name: /서윤/ })
    expect(card).toHaveAttribute('href', '/works/w1/wiki/entries/e1')
    expect(within(card).getByText('윤')).toBeInTheDocument()
    expect(within(card).getByText('검을 쓰는 주인공')).toBeInTheDocument()
    expect(within(card).getByText('사실 3개')).toBeInTheDocument()
  })

  it('shows the add button to editors', () => {
    render(<EntryList {...base} entries={entries} canEdit />)
    expect(screen.getByRole('button', { name: '새 인물' })).toBeInTheDocument()
  })

  it('hides write controls from viewers', () => {
    render(<EntryList {...base} entries={entries} canEdit={false} />)
    expect(screen.queryByRole('button', { name: '새 인물' })).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no cards yet', () => {
    render(<EntryList {...base} entries={[]} canEdit={false} />)
    expect(screen.getByText('아직 인물이 없습니다.')).toBeInTheDocument()
  })

  it('says the search found nothing, and offers to clear it, when a search matches no card', () => {
    render(<EntryList {...base} query="민준" entries={[]} canEdit={false} />)
    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText('아직 인물이 없습니다.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '검색 지우기' })).toHaveAttribute(
      'href',
      '/works/w1/wiki?tab=characters',
    )
  })

  it('keeps the kind filter when clearing a search on the world tab', () => {
    render(
      <EntryList
        {...base}
        tab="world"
        kinds={['place']}
        defaultKind="place"
        filterKinds={['place', 'item']}
        kindFilter="place"
        query="성"
        entries={[]}
        canEdit={false}
      />,
    )
    expect(screen.getByRole('link', { name: '검색 지우기' })).toHaveAttribute(
      'href',
      '/works/w1/wiki?tab=world&kind=place',
    )
  })

  it('marks the chosen kind chip as current on the world tab', () => {
    render(
      <EntryList
        {...base}
        tab="world"
        kinds={['place']}
        defaultKind="place"
        filterKinds={['place', 'item']}
        kindFilter="place"
        entries={[]}
        canEdit={false}
      />,
    )
    const filters = screen.getByRole('navigation', { name: '분류 필터' })
    expect(within(filters).getByRole('link', { name: '장소' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(filters).getByRole('link', { name: '전체' })).not.toHaveAttribute('aria-current')
  })
})
