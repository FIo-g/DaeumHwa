// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FactStatusBadge } from './fact-status-badge'

afterEach(() => {
  cleanup()
})

describe('FactStatusBadge', () => {
  it('shows 확정 for confirmed facts', () => {
    render(<FactStatusBadge status="confirmed" />)
    expect(screen.getByText('확정')).toBeInTheDocument()
  })

  it('marks assumed facts with the [가정] prefix', () => {
    render(<FactStatusBadge status="assumed" />)
    expect(screen.getByText('[가정]')).toBeInTheDocument()
  })

  it('shows 미정 for undecided facts', () => {
    render(<FactStatusBadge status="undecided" />)
    expect(screen.getByText('미정')).toBeInTheDocument()
  })
})
