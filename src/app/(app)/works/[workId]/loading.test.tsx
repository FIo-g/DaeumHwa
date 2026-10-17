// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import WorkLoading from './loading'

describe('WorkLoading', () => {
  afterEach(() => cleanup())

  it('announces loading to assistive tech', () => {
    render(<WorkLoading />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('불러오는 중입니다.')
  })
})
