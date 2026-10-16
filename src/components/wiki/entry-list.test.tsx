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

  it('shows an empty state when nothing matches', () => {
    render(<EntryList {...base} entries={[]} canEdit={false} />)
    expect(screen.getByText('아직 인물이 없습니다.')).toBeInTheDocument()
  })
})
