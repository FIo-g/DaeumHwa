// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkSidebar } from './work-sidebar'

const pathname = vi.hoisted(() => ({ value: '/works/w1/approvals' }))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}))

afterEach(() => {
  cleanup()
  pathname.value = '/works/w1/approvals'
})

function renderSidebar(pendingCount = 3) {
  return render(<WorkSidebar workId="w1" workTitle="별빛 계약" pendingCount={pendingCount} />)
}

describe('WorkSidebar', () => {
  it('links to the main work sections with Korean labels', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation', { name: '작품 메뉴' })
    expect(within(nav).getByRole('link', { name: '홈' })).toHaveAttribute('href', '/works/w1')
    expect(within(nav).getByRole('link', { name: '집필' })).toHaveAttribute(
      'href',
      '/works/w1/write',
    )
    expect(within(nav).getByRole('link', { name: '회차' })).toHaveAttribute(
      'href',
      '/works/w1/chapters',
    )
    expect(within(nav).getByRole('link', { name: '설정 보드' })).toHaveAttribute(
      'href',
      '/works/w1/wiki',
    )
    expect(within(nav).getByRole('link', { name: '작품 설정' })).toHaveAttribute(
      'href',
      '/works/w1/settings',
    )
  })

  it('marks the current section as the current page', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation', { name: '작품 메뉴' })
    expect(within(nav).getByRole('link', { name: /승인 대기/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current')
  })

  it('keeps the home link active only on the exact home path', () => {
    pathname.value = '/works/w1'
    renderSidebar()
    const nav = screen.getByRole('navigation', { name: '작품 메뉴' })
    expect(within(nav).getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /승인 대기/ })).not.toHaveAttribute('aria-current')
  })

  it('shows the pending count badge on the approvals link when there are pending items', () => {
    renderSidebar(3)
    const nav = screen.getByRole('navigation', { name: '작품 메뉴' })
    expect(within(nav).getByRole('link', { name: /승인 대기/ })).toHaveTextContent('3')
  })

  it('shows the settings link to every member, so non-owners can reach the team tab and leave', () => {
    render(<WorkSidebar workId="w1" workTitle="별빛 계약" pendingCount={0} />)
    const nav = screen.getByRole('navigation', { name: '작품 메뉴' })
    expect(within(nav).getByRole('link', { name: '작품 설정' })).toHaveAttribute(
      'href',
      '/works/w1/settings',
    )
  })

  it('hides the pending count badge when nothing is pending', () => {
    renderSidebar(0)
    const nav = screen.getByRole('navigation', { name: '작품 메뉴' })
    const link = within(nav).getByRole('link', { name: '승인 대기' })
    expect(link.querySelector('[data-slot="pending-count"]')).toBeNull()
  })
})
