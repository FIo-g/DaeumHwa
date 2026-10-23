// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { createFactAction, updateFactAction } from '@/server/actions/wiki'
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

const run = vi.mocked(runAction)
const create = vi.mocked(createFactAction)
const update = vi.mocked(updateFactAction)

beforeEach(() => {
  run.mockResolvedValue({ id: 'f1' } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FactFormDialog reveal chapter', () => {
  it('shows the 공개 회차 hint and sends the reveal chapter on create', async () => {
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
    expect(screen.getByText('이 회차 전에는 AI 초안에 넣지 않습니다.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('사실 내용'), { target: { value: '비밀 통로가 있다.' } })
    fireEvent.change(screen.getByLabelText('공개 회차'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ revealAtPosition: 5 }))
  })

  it('prefills the reveal chapter when editing and sends it on update', async () => {
    update.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
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
          revealAtPosition: 5,
        }}
        triggerLabel="내용 수정"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '내용 수정' }))
    expect(screen.getByLabelText('공개 회차')).toHaveValue(5)
    fireEvent.change(screen.getByLabelText('공개 회차'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ revealAtPosition: null }))
  })
})
