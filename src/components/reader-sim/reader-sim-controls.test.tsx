// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { postAction } from '@/lib/client/post-json'
import { ReaderSimControls } from './reader-sim-controls'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/client/post-json', () => ({ postAction: vi.fn() }))
vi.mock('@/lib/client/run-action', () => ({ runAction: vi.fn((promise) => promise) }))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it('runs the chosen personas on the chapter selected by the slider', () => {
  vi.mocked(postAction).mockReturnValue(new Promise(() => {}))
  render(
    <ReaderSimControls
      workId="work"
      chapters={[
        { id: 'first', position: 1, title: '첫 방문' },
        { id: 'second', position: 2, title: '재회' },
      ]}
      personas={[
        { id: 'reader-genre', name: '장르 독자' },
        { id: 'reader-novice', name: '신규 독자' },
      ]}
      initialChapter="first"
    />,
  )

  const slider = screen.getByRole('slider', { name: '회차 넘기기' })
  fireEvent.change(slider, { target: { value: '1' } })
  expect(slider).toHaveAttribute('aria-valuetext', '2화 재회')
  expect(screen.getByRole('combobox', { name: '회차 선택' })).toHaveTextContent('2화 재회')
  fireEvent.click(screen.getByRole('checkbox', { name: '장르 독자' }))
  fireEvent.click(screen.getByRole('button', { name: '독자 반응 보기' }))
  expect(postAction).toHaveBeenCalledWith(
    '/api/works/work/chapters/second/reader-sim',
    { personaIds: ['reader-novice'] },
    { signal: expect.any(AbortSignal) },
  )
})

it('asks for a chapter before allowing a run', () => {
  render(<ReaderSimControls workId="work" chapters={[]} personas={[]} initialChapter={null} />)
  expect(screen.getByText('독자 반응을 보려면 먼저 회차를 만들어 주세요.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '독자 반응 보기' })).not.toBeInTheDocument()
})
