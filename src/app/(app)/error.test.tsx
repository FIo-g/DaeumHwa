// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppError from './error'

describe('AppError boundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows Korean copy and hides the raw error message', () => {
    render(<AppError error={new Error('boom')} retry={() => undefined} />)

    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument()
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument()
  })

  it('calls retry when 다시 시도 is clicked', () => {
    const retry = vi.fn()
    render(<AppError error={new Error('boom')} retry={retry} />)

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('links back to the work list', () => {
    render(<AppError error={new Error('boom')} retry={() => undefined} />)

    expect(screen.getByRole('link', { name: '내 작품으로 가기' })).toHaveAttribute('href', '/works')
  })
})
