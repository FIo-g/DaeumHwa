// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WikiTabs } from './wiki-tabs'

afterEach(() => {
  cleanup()
})

describe('WikiTabs requests tab', () => {
  it('shows the 요청 tab after the style tab and links it to the ledger', () => {
    render(<WikiTabs workId="w1" active="requests" />)
    const links = screen.getAllByRole('link')
    const labels = links.map((link) => link.textContent)
    expect(labels.indexOf('요청')).toBe(labels.indexOf('문체 카드') + 1)
    expect(screen.getByRole('link', { name: '요청' })).toHaveAttribute(
      'href',
      '/works/w1/wiki?tab=requests',
    )
    expect(screen.getByRole('link', { name: '요청' })).toHaveAttribute('aria-current', 'page')
  })
})
