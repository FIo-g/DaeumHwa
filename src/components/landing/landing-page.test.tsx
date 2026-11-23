// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { LandingPage } from './landing-page'

vi.mock('./proof-row', () => ({
  ProofRow: (props: ComponentProps<'div'>) => <div {...props} />,
}))

afterEach(cleanup)

it('renders the intro, sample marks, and accessible thread timeline', () => {
  render(<LandingPage />)

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    /^백 화를 넘겨도,\s*3화에 정한 설정 그대로\.$/,
  )

  const examples = within(screen.getByRole('list'))
  for (const phrase of ['열한 층', '왼손', '19살']) {
    expect(examples.getByText(phrase)).toBeInTheDocument()
  }

  expect(
    screen.getByRole('img', { name: '어머니의 편지: 1화에 심음, 5화에 회수 목표' }),
  ).toBeInTheDocument()
})
