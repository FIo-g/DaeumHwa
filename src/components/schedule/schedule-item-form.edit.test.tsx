// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { createScheduleItemAction, updateScheduleItemAction } from '@/server/actions/schedule'
import { ScheduleItemForm } from './schedule-item-form'
import { type ScheduleItemView, ScheduleItemList } from './schedule-item-list'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/schedule', () => ({
  createScheduleItemAction: vi.fn(),
  updateScheduleItemAction: vi.fn(),
  deleteScheduleItemAction: vi.fn(),
  setScheduleItemDoneAction: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const create = vi.mocked(createScheduleItemAction)
const update = vi.mocked(updateScheduleItemAction)

const item: ScheduleItemView = {
  id: 'i1',
  kind: 'deadline',
  title: '마감',
  date: '2026-11-10',
  endDate: null,
  chapterId: null,
  note: '',
  done: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('ScheduleItemForm edit', () => {
  it('saves changes to an existing item through updateScheduleItemAction', async () => {
    update.mockResolvedValue({ ok: true, data: item } as never)
    const onDone = vi.fn()

    render(
      <ScheduleItemForm workId="w1" today="2026-11-10" chapters={[]} item={item} onDone={onDone} />,
    )

    expect(screen.getByLabelText('제목')).toHaveValue('마감')
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '3화 마감' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'i1', title: '3화 마감' }),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(create).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('일정을 고쳤습니다.')
  })

  it('adds a new item without an item prop', async () => {
    create.mockResolvedValue({ ok: true, data: item } as never)

    render(<ScheduleItemForm workId="w1" today="2026-11-10" chapters={[]} />)

    expect(screen.getByRole('button', { name: '추가' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '3화 마감' } })
    fireEvent.click(screen.getByRole('button', { name: '추가' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ workId: 'w1', title: '3화 마감' }),
    )
    expect(update).not.toHaveBeenCalled()
  })
})

describe('ScheduleItemList edit', () => {
  it('opens the edit dialog with the item fields', () => {
    render(<ScheduleItemList workId="w1" items={[item]} chapters={[]} canEdit />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))

    expect(screen.getByRole('heading', { name: '일정 수정' })).toBeInTheDocument()
    expect(screen.getByLabelText('제목')).toHaveValue('마감')
  })
})
