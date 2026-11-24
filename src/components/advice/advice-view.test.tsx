// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { postAction } from '@/lib/client/post-json'
import { AdviceView } from './advice-view'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/lib/client/post-json', () => ({
  postAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(async (promise: Promise<{ ok: boolean; data?: unknown }>) => {
    const result = await promise
    return result.ok ? result.data : null
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AdviceView', () => {
  it('shows the elapsed seconds and a cancel button while advice is being made', () => {
    vi.mocked(postAction).mockReturnValue(new Promise(() => {}))
    render(<AdviceView workId="w1" canRun runs={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '다음 전개 조언 받기' }))
    expect(screen.getByText('조언 만드는 중…')).toHaveTextContent(/^조언 만드는 중… 0초$/)
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다음 전개 조언 받기' })).not.toBeInTheDocument()
  })

  it('posts to the advice route with an abort signal', () => {
    vi.mocked(postAction).mockReturnValue(new Promise(() => {}))
    render(<AdviceView workId="w1" canRun runs={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '다음 전개 조언 받기' }))
    expect(postAction).toHaveBeenCalledWith(
      '/api/works/w1/advice',
      {},
      {
        signal: expect.any(AbortSignal),
      },
    )
  })

  it('brings the request button back when the user cancels', () => {
    vi.mocked(postAction).mockReturnValue(new Promise(() => {}))
    render(<AdviceView workId="w1" canRun runs={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '다음 전개 조언 받기' }))
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.getByRole('button', { name: '다음 전개 조언 받기' })).toBeInTheDocument()
    expect(screen.queryByText(/조언 만드는 중/)).not.toBeInTheDocument()
  })

  it('hides the request button from viewers', () => {
    render(<AdviceView workId="w1" canRun={false} runs={[]} />)
    expect(screen.queryByRole('button', { name: '다음 전개 조언 받기' })).not.toBeInTheDocument()
  })
})

it('marks only the chosen option as selected', () => {
  render(
    <AdviceView
      workId="w1"
      canRun
      runs={[
        {
          id: 'run-1',
          createdAt: '2026-11-24T01:00:00Z',
          result: {
            options: ['다툼', '화해', '이별'].map((title) => ({
              title,
              summary: '전개 요약',
              beats: ['대화를 나눈다'],
              usesThreads: [],
              involvedCharacters: [],
              risk: '',
            })),
            warnings: [],
            recommendedIndex: 0,
            recommendationReason: '오해를 풀 수 있어요.',
          },
        },
      ]}
    />,
  )
  const first = screen.getByRole('button', { name: '선택지 1 다툼' })
  const second = screen.getByRole('button', { name: '선택지 2 화해' })
  fireEvent.click(first)
  expect(first).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(second)
  expect(first).toHaveAttribute('aria-pressed', 'false')
  expect(second.closest('article')).toHaveAttribute('data-selected', 'true')
})
