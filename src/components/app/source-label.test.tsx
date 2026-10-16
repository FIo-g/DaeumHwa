// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SourceLabel } from './source-label'

afterEach(() => {
  cleanup()
})

describe('SourceLabel', () => {
  it('links a chapter source to its writing screen with the chapter label', () => {
    render(
      <SourceLabel
        workId="w1"
        sourceType="chapter"
        chapter={{ id: 'c3', position: 3, title: '재회' }}
      />,
    )
    const link = screen.getByRole('link', { name: '3화 재회' })
    expect(link).toHaveAttribute('href', '/works/w1/chapters/c3')
  })

  it('shows plain text for non-chapter sources', () => {
    render(<SourceLabel workId="w1" sourceType="interview" chapter={null} />)
    expect(screen.getByText('인터뷰')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
