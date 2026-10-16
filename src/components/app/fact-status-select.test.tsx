// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FactStatusSelect } from './fact-status-select'

afterEach(() => {
  cleanup()
})

describe('FactStatusSelect', () => {
  it('shows the three status options with the current one pressed', () => {
    render(<FactStatusSelect value="assumed" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '확정' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '가정' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '미정' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the new status when another option is picked', () => {
    const onChange = vi.fn()
    render(<FactStatusSelect value="assumed" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '미정' }))
    expect(onChange).toHaveBeenCalledWith('undecided')
  })

  it('renders a hidden input with the value when a name is given', () => {
    const { container } = render(
      <FactStatusSelect value="confirmed" onChange={() => {}} name="status" />,
    )
    const input = container.querySelector('input[name="status"]')
    expect(input).toHaveValue('confirmed')
  })
})
