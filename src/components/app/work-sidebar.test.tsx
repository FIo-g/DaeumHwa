// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

function renderSidebar(pendingCount = 3, trial = false) {
  return render(
    <WorkSidebar workId="w1" workTitle="별빛 계약" pendingCount={pendingCount} trial={trial} />,
  )
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
    renderSidebar(0)
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

  it('shows only the four gated links with the signup chip in both trial menus', () => {
    pathname.value = '/works/w1/advice'
    renderSidebar(0, true)
    fireEvent.click(screen.getByRole('button', { name: '작품 메뉴 열기' }))
    for (const menu of screen.getAllByRole('navigation', { name: '작품 메뉴' })) {
      const nav = within(menu)
      expect(nav.getAllByRole('link', { name: /가입 필요$/ })).toHaveLength(4)
      for (const [label, path] of [
        ['방향 조언', 'advice'],
        ['독자 시뮬레이션', 'reader-sim'],
        ['가져오기', 'import'],
        ['인터뷰', 'interview'],
      ]) {
        expect(nav.getByRole('link', { name: `${label} 가입 필요` })).toHaveAttribute(
          'href',
          `/works/w1/${path}`,
        )
      }
      expect(nav.getByRole('link', { name: '방향 조언 가입 필요' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(nav.getByRole('link', { name: '회차' })).toBeInTheDocument()
      expect(nav.getByRole('link', { name: '작품 설정' })).toBeInTheDocument()
    }
  })

  it('omits the signup chip for a registered account', () => {
    renderSidebar()
    const nav = within(screen.getByRole('navigation', { name: '작품 메뉴' }))
    expect(nav.queryAllByText('가입 필요')).toHaveLength(0)
    expect(nav.getByRole('link', { name: '방향 조언' })).toBeInTheDocument()
  })
})
