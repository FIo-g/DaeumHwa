// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { removeMemberAction } from '@/server/actions/members'
import { MembersPanel } from './members-panel'

const { refresh, push } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh }),
}))

vi.mock('@/server/actions/members', () => ({
  changeMemberRoleAction: vi.fn(),
  removeMemberAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const remove = vi.mocked(removeMemberAction)

const members = [
  { userId: 'u-owner', name: '김작가', email: 'owner@example.com', role: 'owner' as const },
  { userId: 'u-editor', name: '이서윤', email: 'seoyun@example.com', role: 'editor' as const },
  { userId: 'u-viewer', name: '박독자', email: 'reader@example.com', role: 'viewer' as const },
]

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('MembersPanel for the owner', () => {
  it('lists every member with name, email and role', () => {
    render(
      <MembersPanel workId="w1" viewerRole="owner" currentUserId="u-owner" members={members} />,
    )
    expect(screen.getByText('김작가')).toBeInTheDocument()
    expect(screen.getByText('seoyun@example.com')).toBeInTheDocument()
    expect(screen.getByText('소유자')).toBeInTheDocument()
  })

  it('offers a role select and a remove button for each non-owner member', () => {
    render(
      <MembersPanel workId="w1" viewerRole="owner" currentUserId="u-owner" members={members} />,
    )
    expect(screen.getByRole('combobox', { name: '이서윤 역할' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '박독자 역할' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '김작가 역할' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '내보내기' })).toHaveLength(2)
  })

  it('removes a member after confirmation and refreshes', async () => {
    run.mockResolvedValue(undefined as never)
    render(
      <MembersPanel workId="w1" viewerRole="owner" currentUserId="u-owner" members={members} />,
    )
    const row = screen.getByText('이서윤').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '내보내기' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '내보내기' }),
    )

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(remove).toHaveBeenCalledWith({ workId: 'w1', userId: 'u-editor' })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })
})

describe('MembersPanel for a member who is not the owner', () => {
  it('shows roles read-only and no remove buttons for other members', () => {
    render(
      <MembersPanel workId="w1" viewerRole="editor" currentUserId="u-editor" members={members} />,
    )
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('보기 전용')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '내보내기' })).not.toBeInTheDocument()
  })

  it('lets the member leave the work and sends them back to the works list', async () => {
    run.mockResolvedValue(undefined as never)
    render(
      <MembersPanel workId="w1" viewerRole="editor" currentUserId="u-editor" members={members} />,
    )
    const row = screen.getByText('이서윤').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '작품에서 나가기' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '나가기' }))

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(remove).toHaveBeenCalledWith({ workId: 'w1', userId: 'u-editor' })
    expect(push).toHaveBeenCalledWith('/works')
  })

  it('does not offer to leave for the owner', () => {
    render(
      <MembersPanel workId="w1" viewerRole="owner" currentUserId="u-owner" members={members} />,
    )
    expect(screen.queryByRole('button', { name: '작품에서 나가기' })).not.toBeInTheDocument()
  })
})
