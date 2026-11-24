// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GlobalError from './global-error'

describe('GlobalError boundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders its own Korean document with a heading', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error('x')} retry={() => undefined} />,
    )

    expect(html).toContain('<html lang="ko">')
    expect(html).toContain('페이지를 불러오지 못했어요')
    expect(html).not.toContain('>x<')
  })

  it('calls retry when 다시 시도 is clicked', () => {
    const retry = vi.fn()
    render(<GlobalError error={new Error('x')} retry={retry} />)

    expect(screen.getByRole('heading', { name: '페이지를 불러오지 못했어요' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(retry).toHaveBeenCalledTimes(1)
  })
})
