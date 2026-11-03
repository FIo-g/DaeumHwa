// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { createFactAction } from '@/server/actions/wiki'
import { FactFormDialog } from './fact-form'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createFactAction: vi.fn(),
  updateFactAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const run = vi.mocked(runAction)
const create = vi.mocked(createFactAction)
const toastError = vi.mocked(toast.error)

beforeEach(() => {
  run.mockResolvedValue({ id: 'f1' } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FactFormDialog valid range', () => {
  it('sends the start position and an open end on create', async () => {
    render(
      <FactFormDialog
        workId="w1"
        mode="create"
        entryId="e1"
        chapters={[]}
        triggerLabel="사실 추가"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '사실 추가' }))
    expect(screen.getByText('비워 두면 처음부터 끝까지 유효합니다.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('사실 내용'), {
      target: { value: '비밀 통로가 있다.' },
    })
    fireEvent.change(screen.getByLabelText('유효 시작 회차'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ validFromPosition: 3, validToPosition: null }),
    )
  })

  it('prefills the start position when editing', () => {
    render(
      <FactFormDialog
        workId="w1"
        mode="edit"
        chapters={[]}
        fact={{
          id: 'f1',
          content: '비밀 통로가 있다.',
          status: 'confirmed',
          sourceChapterId: null,
          evidence: '',
          validFromPosition: 2,
        }}
        triggerLabel="내용 수정"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '내용 수정' }))

    expect(screen.getByLabelText('유효 시작 회차')).toHaveValue(2)
  })

  it('keeps the native required check on the content field', async () => {
    render(
      <FactFormDialog
        workId="w1"
        mode="create"
        entryId="e1"
        chapters={[]}
        triggerLabel="사실 추가"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '사실 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(create).not.toHaveBeenCalled()
    expect(screen.getByLabelText('사실 내용')).toBeInvalid()
  })

  it('rejects an end before the start without calling the action', async () => {
    render(
      <FactFormDialog
        workId="w1"
        mode="create"
        entryId="e1"
        chapters={[]}
        triggerLabel="사실 추가"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '사실 추가' }))
    fireEvent.change(screen.getByLabelText('사실 내용'), {
      target: { value: '비밀 통로가 있다.' },
    })
    fireEvent.change(screen.getByLabelText('유효 시작 회차'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('유효 끝 회차'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('끝 회차는 시작 회차보다 앞설 수 없습니다.'),
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects a position below 1 without calling the action', async () => {
    render(
      <FactFormDialog
        workId="w1"
        mode="create"
        entryId="e1"
        chapters={[]}
        triggerLabel="사실 추가"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '사실 추가' }))
    fireEvent.change(screen.getByLabelText('사실 내용'), {
      target: { value: '비밀 통로가 있다.' },
    })
    fireEvent.change(screen.getByLabelText('유효 시작 회차'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('유효 회차는 1 이상으로 적어 주세요.'),
    )
    expect(create).not.toHaveBeenCalled()
  })
})
