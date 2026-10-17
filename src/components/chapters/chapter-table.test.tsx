// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChapterTable, type ChapterTableRow } from './chapter-table'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  setChapterStatusAction: vi.fn(),
  setChapterPublishedOnAction: vi.fn(),
  moveChapterAction: vi.fn(),
  archiveChapterAction: vi.fn(),
  restoreChapterAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}))

vi.mock('@/server/actions/chapters', () => ({
  setChapterStatusAction: mocks.setChapterStatusAction,
  setChapterPublishedOnAction: mocks.setChapterPublishedOnAction,
  moveChapterAction: mocks.moveChapterAction,
  archiveChapterAction: mocks.archiveChapterAction,
  restoreChapterAction: mocks.restoreChapterAction,
}))

const rows: ChapterTableRow[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    position: 1,
    title: '시작',
    status: 'done',
    charCount: 1200,
    publishedOn: '2026-10-20',
    updatedAt: '2026-10-16T05:00:00.000Z',
    archivedAt: null,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    position: 2,
    title: '',
    status: 'draft',
    charCount: 300,
    publishedOn: null,
    updatedAt: '2026-10-16T06:00:00.000Z',
    archivedAt: null,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    position: 3,
    title: '옛 장면',
    status: 'draft',
    charCount: 50,
    publishedOn: null,
    updatedAt: '2026-10-15T06:00:00.000Z',
    archivedAt: '2026-10-15T07:00:00.000Z',
  },
]

beforeEach(() => {
  mocks.refresh.mockReset()
  mocks.setChapterStatusAction.mockReset().mockResolvedValue({ ok: true, data: {} })
  mocks.setChapterPublishedOnAction.mockReset().mockResolvedValue({ ok: true, data: {} })
  mocks.moveChapterAction.mockReset().mockResolvedValue({ ok: true, data: undefined })
  mocks.archiveChapterAction.mockReset().mockResolvedValue({ ok: true, data: {} })
  mocks.restoreChapterAction.mockReset().mockResolvedValue({ ok: true, data: {} })
})

afterEach(() => {
  cleanup()
})

describe('ChapterTable', () => {
  it('hides archived chapters until the archived toggle is on', () => {
    render(<ChapterTable workId="w1" chapters={rows} canEdit />)
    expect(screen.getByRole('link', { name: '1화 시작' })).toBeInTheDocument()
    expect(screen.queryByText('3화 옛 장면')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: '보관한 회차 보기' }))
    expect(screen.getByText('3화 옛 장면')).toBeInTheDocument()
  })

  it('shows the character count with spaces and the publish date', () => {
    render(<ChapterTable workId="w1" chapters={rows} canEdit />)
    expect(screen.getByText('1,200')).toBeInTheDocument()
    expect(screen.getByLabelText('1화 연재일')).toHaveValue('2026-10-20')
  })

  it('toggles the status of a chapter for editors', async () => {
    render(<ChapterTable workId="w1" chapters={rows} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: '2화 상태 바꾸기' }))
    await waitFor(() =>
      expect(mocks.setChapterStatusAction).toHaveBeenCalledWith({
        chapterId: rows[1].id,
        status: 'done',
      }),
    )
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  })

  it('disables moving the first chapter up and the last visible chapter down', () => {
    render(<ChapterTable workId="w1" chapters={rows} canEdit />)
    expect(screen.getByRole('button', { name: '1화 위로 이동' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '2화 아래로 이동' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '2화 위로 이동' })).toBeEnabled()
  })

  it('moves a chapter with the action', async () => {
    render(<ChapterTable workId="w1" chapters={rows} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: '2화 위로 이동' }))
    await waitFor(() =>
      expect(mocks.moveChapterAction).toHaveBeenCalledWith({
        chapterId: rows[1].id,
        direction: 'up',
      }),
    )
  })

  it('archives a chapter after confirmation', async () => {
    render(<ChapterTable workId="w1" chapters={rows} canEdit />)
    fireEvent.click(screen.getAllByRole('button', { name: '보관' })[0])
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '보관하기' }))
    await waitFor(() =>
      expect(mocks.archiveChapterAction).toHaveBeenCalledWith({ chapterId: rows[0].id }),
    )
  })

  it('shows no write controls for viewers', () => {
    render(<ChapterTable workId="w1" chapters={rows} canEdit={false} />)
    expect(screen.queryByRole('button', { name: '1화 위로 이동' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2화 상태 바꾸기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '보관' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('1화 연재일')).toBeDisabled()
  })

  describe('publish date input', () => {
    function dateInput() {
      return screen.getByLabelText('1화 연재일') as HTMLInputElement
    }

    it('does not save while the author is still typing a date', async () => {
      render(<ChapterTable workId="w1" chapters={rows} canEdit />)
      const input = dateInput()
      fireEvent.change(input, { target: { value: '0002-10-17' } })
      fireEvent.change(input, { target: { value: '0020-10-17' } })
      fireEvent.change(input, { target: { value: '2026-10-17' } })
      expect(mocks.setChapterPublishedOnAction).not.toHaveBeenCalled()
      expect(dateInput()).not.toBeDisabled()
      expect(dateInput().value).toBe('2026-10-17')
    })

    it('saves the typed date once when the field loses focus', async () => {
      render(<ChapterTable workId="w1" chapters={rows} canEdit />)
      const input = dateInput()
      fireEvent.change(input, { target: { value: '0002-10-17' } })
      fireEvent.change(input, { target: { value: '2026-10-17' } })
      fireEvent.blur(input)
      await waitFor(() =>
        expect(mocks.setChapterPublishedOnAction).toHaveBeenCalledWith({
          chapterId: rows[0].id,
          publishedOn: '2026-10-17',
        }),
      )
      expect(mocks.setChapterPublishedOnAction).toHaveBeenCalledTimes(1)
    })

    it('saves when Enter is pressed', async () => {
      render(<ChapterTable workId="w1" chapters={rows} canEdit />)
      const input = dateInput()
      fireEvent.change(input, { target: { value: '2026-10-21' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() =>
        expect(mocks.setChapterPublishedOnAction).toHaveBeenCalledWith({
          chapterId: rows[0].id,
          publishedOn: '2026-10-21',
        }),
      )
    })

    it('does not call the action when the value is unchanged', async () => {
      render(<ChapterTable workId="w1" chapters={rows} canEdit />)
      fireEvent.blur(dateInput())
      await Promise.resolve()
      expect(mocks.setChapterPublishedOnAction).not.toHaveBeenCalled()
    })

    it('does not call the action for an out-of-range year and restores the saved date', async () => {
      render(<ChapterTable workId="w1" chapters={rows} canEdit />)
      const input = dateInput()
      fireEvent.change(input, { target: { value: '0002-10-17' } })
      fireEvent.blur(input)
      await Promise.resolve()
      expect(mocks.setChapterPublishedOnAction).not.toHaveBeenCalled()
      expect(dateInput().value).toBe('2026-10-20')
    })

    it('clears the date when the field is emptied and blurred', async () => {
      render(<ChapterTable workId="w1" chapters={rows} canEdit />)
      const input = dateInput()
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.blur(input)
      await waitFor(() =>
        expect(mocks.setChapterPublishedOnAction).toHaveBeenCalledWith({
          chapterId: rows[0].id,
          publishedOn: null,
        }),
      )
    })

    it('keeps the saved date when the field holds a half-typed date on blur', async () => {
      render(<ChapterTable workId="w1" chapters={rows} canEdit />)
      const input = dateInput()
      // jsdom cannot produce a half-typed date, so simulate the browser flag.
      Object.defineProperty(input, 'validity', {
        configurable: true,
        value: { badInput: true },
      })
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.blur(input)
      await Promise.resolve()
      expect(mocks.setChapterPublishedOnAction).not.toHaveBeenCalled()
      expect(dateInput().value).toBe('2026-10-20')
    })

    it('puts the saved date back when the save fails', async () => {
      mocks.setChapterPublishedOnAction.mockResolvedValue({
        ok: false,
        error: { code: 'VALIDATION', message: '연재일 형식이 올바르지 않습니다.' },
      })
      render(<ChapterTable workId="w1" chapters={rows} canEdit />)
      const input = dateInput()
      fireEvent.change(input, { target: { value: '2026-10-22' } })
      fireEvent.blur(input)
      await waitFor(() => expect(mocks.setChapterPublishedOnAction).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(dateInput().value).toBe('2026-10-20'))
      expect(mocks.refresh).not.toHaveBeenCalled()
    })
  })
})
