// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkCard } from './work-card'

afterEach(() => {
  cleanup()
})

const base = {
  id: 'w1',
  title: '달빛 연대기',
  genre: '현대 판타지',
  role: 'owner' as const,
  chapterCount: 12,
  pendingCount: 3,
  openThreadCount: 4,
  alertCount: 0,
  lastEditedAt: new Date('2026-10-16T05:00:00.000Z'),
}

describe('WorkCard', () => {
  it('shows the title, genre and chapter count inside a link to the work home', () => {
    render(<WorkCard {...base} />)
    const link = screen.getByRole('link', { name: /달빛 연대기/ })
    expect(link).toHaveAttribute('href', '/works/w1')
    expect(link).toHaveTextContent('현대 판타지')
    expect(screen.getByText('회차').closest('li')).toHaveTextContent(/^회차12화$/)
  })

  it('retains the full work title and the card information for assistive technology', () => {
    const title = '쉬지않고이어지는긴제목'.repeat(4)
    render(<WorkCard {...base} title={title} />)

    const link = screen.getByRole('link', { name: title })
    expect(link).toHaveAttribute('title', title)
    expect(link).toHaveAccessibleDescription(/현대 판타지.*승인 대기.*최근 수정/)
  })

  it('shows the pending and open thread counts', () => {
    render(<WorkCard {...base} />)
    expect(screen.getByText('승인 대기').closest('li')).toHaveTextContent(/승인 대기\s*3/)
    expect(screen.getByText('열린 떡밥').closest('li')).toHaveTextContent(/열린 떡밥\s*4/)
  })

  it('shows the warning badge only when there are warnings', () => {
    const { rerender } = render(<WorkCard {...base} />)
    expect(screen.queryByText(/경고/)).not.toBeInTheDocument()
    rerender(<WorkCard {...base} alertCount={2} />)
    expect(screen.getByText('경고 2')).toBeInTheDocument()
  })
})
