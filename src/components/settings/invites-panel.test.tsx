// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { createInviteAction, revokeInviteAction } from '@/server/actions/members'
import { InvitesPanel } from './invites-panel'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}))

vi.mock('@/server/actions/members', () => ({
  createInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
  acceptInviteAction: vi.fn(),
  changeMemberRoleAction: vi.fn(),
  removeMemberAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const run = vi.mocked(runAction)
const create = vi.mocked(createInviteAction)
const revoke = vi.mocked(revokeInviteAction)

const activeInvites = [
  {
    id: 'i-1',
    role: 'viewer' as const,
    token: 'tok-existing',
    expiresAt: '2026-10-23T00:00:00.000Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('InvitesPanel', () => {
  it('explains how invite links work', () => {
    render(<InvitesPanel workId="w1" invites={[]} />)
    expect(
      screen.getByText(
        '초대 링크를 받은 사람은 로그인한 뒤 이 작품에 참여합니다. 링크는 한 번만 쓸 수 있고 7일 뒤 만료됩니다.',
      ),
    ).toBeInTheDocument()
  })

  it('creates an editor invite by default and shows its full link', async () => {
    run.mockResolvedValue({
      id: 'i-2',
      workId: 'w1',
      token: 'tok-1',
      role: 'editor',
      expiresAt: new Date('2026-10-23T00:00:00.000Z'),
    } as never)
    render(<InvitesPanel workId="w1" invites={[]} />)
    expect(screen.getByRole('combobox', { name: '초대할 역할' })).toHaveTextContent('편집자')

    fireEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }))

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({ workId: 'w1', role: 'editor' })
    expect(screen.getByText(/\/invite\/tok-1$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '링크 복사' })).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('shows nothing new when creating the invite fails', async () => {
    run.mockResolvedValue(null)
    render(<InvitesPanel workId="w1" invites={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: '링크 복사' })).not.toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('lists active invites with their role and a cancel button', async () => {
    run.mockResolvedValue(undefined as never)
    render(<InvitesPanel workId="w1" invites={activeInvites} />)
    expect(screen.getByText(/보기 전용/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '링크 복사' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '초대 취소' }),
    )

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(revoke).toHaveBeenCalledWith({ inviteId: 'i-1' })
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
