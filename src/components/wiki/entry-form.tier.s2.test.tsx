// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { createEntryAction } from '@/server/actions/wiki'
import { EntryFormDialog } from './entry-form'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const create = vi.mocked(createEntryAction)

beforeEach(() => {
  run.mockResolvedValue({ id: 'e1' } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EntryFormDialog context tier', () => {
  it('offers the AI 문맥 choice with a hint under the summary and sends the chosen tier', async () => {
    const user = userEvent.setup()
    render(
      <EntryFormDialog
        workId="w1"
        mode="create"
        kinds={['place']}
        defaultKind="place"
        triggerLabel="새 장소"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '새 장소' }))
    expect(screen.getByText('짧게 쓸수록 AI가 같은 묘사를 덜 반복합니다.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '왕궁' } })
    await user.click(screen.getByRole('combobox', { name: 'AI 문맥' }))
    await user.click(await screen.findByRole('option', { name: '항상 넣기' }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ contextTier: 'always' }))
  })
})
