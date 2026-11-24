// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LandingPage } from './landing-page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

afterEach(cleanup)

it('renders the intro, sample marks, and accessible thread timeline', () => {
  render(<LandingPage />)

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    /^머릿속 설정집은\s*접어 두세요\.$/,
  )
  const examples = within(document.getElementById('b-sample-result')!)
  for (const phrase of ['열한 층', '왼손']) {
    expect(examples.getByText(phrase)).toBeInTheDocument()
  }
  expect(
    screen.getByRole('img', { name: '어머니의 편지: 1화에 심음, 5화에 회수 목표' }),
  ).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '가입 없이 체험하기' })).toHaveLength(2)
})

it('adds the third finding once and changes the findings when another chapter is selected', () => {
  render(<LandingPage />)
  const results = within(document.getElementById('b-sample-result')!)
  fireEvent.click(results.getByRole('button', { name: '지적 더 보기' }))
  expect(results.getByText('19살')).toBeInTheDocument()
  expect(results.getByText('지적 3건')).toBeInTheDocument()
  expect(results.getByRole('button', { name: '지적을 모두 봤어요' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )

  fireEvent.click(screen.getByRole('link', { name: /^1화 점검/ }))
  expect(results.getByText('열린 지적이 없어요.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: /^2화 점검/ }))
  expect(results.getByText('지적 1건')).toBeInTheDocument()
})

it('shows each author choice and restores the original example', () => {
  render(<LandingPage />)
  const demo = within(screen.getByRole('region', { name: '마지막 결정은 작가에게' }))
  fireEvent.click(demo.getByRole('button', { name: '제안대로 고치기' }))
  expect(demo.getByRole('status')).toHaveTextContent('문장을 바꿨어요.')
  expect(demo.getByText('오른손')).toBeInTheDocument()

  fireEvent.click(demo.getByRole('button', { name: '위키 고치기' }))
  expect(demo.getByRole('status')).toHaveTextContent('사실을 고쳤어요.')
  expect(demo.getByText('위키 예시')).toBeInTheDocument()

  fireEvent.click(demo.getByRole('button', { name: '무시' }))
  expect(demo.getByRole('status')).toHaveTextContent('지적을 닫았어요.')

  fireEvent.click(demo.getByRole('button', { name: '처음으로' }))
  expect(demo.getByRole('status')).toHaveTextContent('열린 지적 1건')
})

it('opens one thread at a time', () => {
  render(<LandingPage />)
  const first = screen.getByRole('button', { name: /^어머니의 편지/ })
  const second = screen.getByRole('button', { name: /^불 꺼진 종루/ })
  fireEvent.click(first)
  expect(first).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('세린이 품에 지닌 편지. 봉인은 아직 뜯지 않았다.')).toBeVisible()
  fireEvent.click(second)
  expect(first).toHaveAttribute('aria-expanded', 'false')
  expect(second).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(second)
  expect(second).toHaveAttribute('aria-expanded', 'false')
})
