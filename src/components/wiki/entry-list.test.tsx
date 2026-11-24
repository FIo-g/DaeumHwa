// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
    firstAppearance: 1,
    facts: [
      {
        id: 'f1',
        status: 'confirmed' as const,
        content: '서윤은 검을 쓴다.',
        validFromPosition: 1,
        validToPosition: null,
      },
    ],
  },
  {
    id: 'e2',
    kind: 'character' as const,
    name: '도현',
    aliases: [],
    summary: '',
    factCount: 0,
    firstAppearance: null,
    facts: [],
  },
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
    const link = screen.getByRole('link', { name: '서윤' })
    expect(link).toHaveAttribute('href', '/works/w1/wiki/entries/e1')
    const row = screen.getAllByRole('listitem').find((item) => item.contains(link))!
    expect(within(row).getByText('윤')).toBeInTheDocument()
    expect(within(row).getByText('검을 쓰는 주인공')).toBeInTheDocument()
    expect(within(row).getByText('사실 3개')).toBeInTheDocument()
  })

  it('opens one preview, reveals its wiki facts and keeps a link to the card', () => {
    render(<EntryList {...base} entries={entries} canEdit />)
    const toggle = screen.getByRole('button', { name: '서윤 미리 보기' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    const preview = screen.getByRole('region', { name: '서윤 미리 보기' })
    expect(within(preview).getByText('서윤은 검을 쓴다.')).toHaveClass('b-quote--wiki')
    expect(within(preview).getByRole('link', { name: '카드 열기' })).toHaveAttribute(
      'href',
      '/works/w1/wiki/entries/e1',
    )
    fireEvent.click(screen.getByRole('button', { name: '도현 미리 보기' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: '서윤 미리 보기' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '도현 미리 보기' }))
    expect(screen.queryByRole('region', { name: '도현 미리 보기' })).not.toBeInTheDocument()
  })

  it('restores the preview of the card returned from its detail page', () => {
    render(<EntryList {...base} entries={entries} initialEntryId="e1" canEdit={false} />)
    expect(screen.getByRole('button', { name: '서윤 미리 보기' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('region', { name: '서윤 미리 보기' })).toBeInTheDocument()
  })

  it('sorts known appearances first and preserves the card links', () => {
    render(<EntryList {...base} entries={entries} canEdit={false} />)
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['도현', '서윤'])
    fireEvent.click(screen.getByRole('radio', { name: '등장 회차순' }))
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['서윤', '도현'])
  })

  it('updates the results only after Korean composition finishes', () => {
    render(<EntryList {...base} entries={entries} canEdit={false} />)
    const search = screen.getByRole('searchbox', { name: '이름, 별칭, 요약 검색' })
    fireEvent.compositionStart(search)
    fireEvent.change(search, { target: { value: 'ㄱ' } })
    expect(screen.getByRole('link', { name: '도현' })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: '쓰 는' } })
    fireEvent.compositionEnd(search)
    expect(screen.getByRole('link', { name: '서윤' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '도현' })).not.toBeInTheDocument()
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
    expect(screen.getByText('아직 인물이 없어요.')).toBeInTheDocument()
  })

  it('says the search found nothing, and offers to clear it, when a search matches no card', () => {
    render(<EntryList {...base} query="민준" entries={[]} canEdit={false} />)
    expect(screen.getByText('검색 결과가 없어요.')).toBeInTheDocument()
    expect(screen.queryByText('아직 인물이 없어요.')).not.toBeInTheDocument()
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
