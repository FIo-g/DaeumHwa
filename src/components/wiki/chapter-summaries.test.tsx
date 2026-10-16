// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { setChapterSummaryAction } from '@/server/actions/chapters'
import { ChapterSummaries } from './chapter-summaries'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/chapters', () => ({
  setChapterSummaryAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const save = vi.mocked(setChapterSummaryAction)

const chapters = [
  { id: 'c1', position: 1, title: '만남', summary: '서윤이 도현을 만난다.' },
  { id: 'c2', position: 2, title: '', summary: '' },
]

beforeEach(() => {
  run.mockResolvedValue({ id: 'c2' } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ChapterSummaries', () => {
  it('shows an empty-summary notice for chapters without a summary', () => {
    render(<ChapterSummaries chapters={chapters} canEdit />)
    expect(screen.getByText('요약이 없습니다')).toBeInTheDocument()
    expect(screen.getByLabelText('1화 만남 요약')).toHaveValue('서윤이 도현을 만난다.')
  })

  it('saves an edited summary through setChapterSummaryAction', async () => {
    render(<ChapterSummaries chapters={chapters} canEdit />)
    const row = screen.getByLabelText('2화 요약').closest('li') as HTMLElement
    fireEvent.change(within(row).getByLabelText('2화 요약'), { target: { value: '새 요약' } })
    fireEvent.click(within(row).getByRole('button', { name: '요약 저장' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ chapterId: 'c2', summary: '새 요약' }))
  })

  it('shows summaries as read-only text to viewers', () => {
    render(<ChapterSummaries chapters={chapters} canEdit={false} />)
    expect(screen.queryByLabelText('1화 만남 요약')).not.toBeInTheDocument()
    expect(screen.getByText('서윤이 도현을 만난다.')).toBeInTheDocument()
  })
})
