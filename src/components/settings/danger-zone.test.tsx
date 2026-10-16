// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { setWorkArchivedAction } from '@/server/actions/works'
import { DangerZone } from './danger-zone'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}))

vi.mock('@/server/actions/works', () => ({
  setWorkArchivedAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const setArchived = vi.mocked(setWorkArchivedAction)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('DangerZone', () => {
  it('archives an active work after confirmation', async () => {
    run.mockResolvedValue({} as never)
    render(<DangerZone workId="w1" archived={false} />)
    fireEvent.click(screen.getByRole('button', { name: '작품 보관' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('작품을 보관할까요?')
    fireEvent.click(within(dialog).getByRole('button', { name: '보관' }))

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(setArchived).toHaveBeenCalledWith({ workId: 'w1', archived: true })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('restores an archived work', async () => {
    run.mockResolvedValue({} as never)
    render(<DangerZone workId="w1" archived />)
    expect(screen.getByText('보관된 작품입니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '보관 해제' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '보관 해제' }))

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(setArchived).toHaveBeenCalledWith({ workId: 'w1', archived: false })
  })

  it('does not archive when the confirmation is cancelled', () => {
    render(<DangerZone workId="w1" archived={false} />)
    fireEvent.click(screen.getByRole('button', { name: '작품 보관' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '취소' }))
    expect(setArchived).not.toHaveBeenCalled()
  })
})
