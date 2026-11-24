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

it('starts with all three findings and only shows findings from the selected episode', () => {
  render(<LandingPage />)
  const results = within(document.getElementById('b-sample-result')!)
  const rail = within(screen.getByRole('region', { name: '예시 회차' }))
  const first = rail.getByRole('link', {
    name: '1화 청해항 입항 청해항의 아침은 비린내부터 밀려왔다.',
  })
  const second = rail.getByRole('link', {
    name: '2화 잿빛 종루 아래 해가 기울 무렵, 세린은 삐걱거리는 여관 계단을 올랐다.',
  })
  const third = rail.getByRole('link', {
    name: '3화 종루의 손짓 이른 아침, 세린은 항구 북쪽 언덕길을 올랐다.',
  })

  function expectAllFindings() {
    expect(results.getByRole('heading', { name: '1~3화 전체' })).toBeInTheDocument()
    expect(results.getByText('지적 3건')).toHaveAttribute('aria-live', 'polite')
    expect(
      within(results.getAllByRole('list')[0])
        .getAllByRole('listitem')
        .map((row) => row.querySelector('.b-number')?.textContent),
    ).toEqual(['1', '2', '3'])
    for (const link of [first, second, third]) expect(link).not.toHaveAttribute('aria-current')
    expect(results.queryByRole('button', { name: '세 문장 모두 보기' })).not.toBeInTheDocument()
  }

  expectAllFindings()

  fireEvent.click(third)
  expect(third).toHaveAttribute('aria-current', 'true')
  expect(results.getByRole('heading', { name: '3화 · 종루의 손짓' })).toBeInTheDocument()
  expect(results.getByText('지적 2건')).toBeInTheDocument()
  expect(results.queryByText('19살')).not.toBeInTheDocument()

  fireEvent.click(second)
  expect(results.getByRole('heading', { name: '2화 · 잿빛 종루 아래' })).toBeInTheDocument()
  expect(results.getByText('지적 1건')).toBeInTheDocument()
  expect(results.getByText('19살')).toBeInTheDocument()
  expect(results.queryByText('열한 층')).not.toBeInTheDocument()

  fireEvent.click(first)
  expect(results.getByRole('heading', { name: '1화 · 청해항 입항' })).toBeInTheDocument()
  expect(results.getByText('지적 0건')).toBeInTheDocument()
  expect(results.getByText('열린 지적이 없어요.')).toBeInTheDocument()

  fireEvent.click(results.getByRole('button', { name: '세 문장 모두 보기' }))
  expectAllFindings()
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
