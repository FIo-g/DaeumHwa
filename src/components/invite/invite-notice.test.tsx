import { beforeEach, expect, it, vi } from 'vitest'
import { getInviteByToken } from '@/server/members'
import { InviteNotice, unavailableInviteMessage } from './invite-notice'

vi.mock('@/db/client', () => ({ getDb: vi.fn() }))
vi.mock('@/server/members', () => ({ getInviteByToken: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

it('checks the return token and displays the existing message for an unavailable invite', async () => {
  vi.mocked(getInviteByToken).mockResolvedValue(null)
  const notice = await InviteNotice({ next: '/invite/some%2Dtoken?source=mail' })
  expect(getInviteByToken).toHaveBeenCalledWith(undefined, 'some-token')
  expect(notice?.props.children).toBe(unavailableInviteMessage)
})

it('shows the unavailable message when the return token cannot be decoded', async () => {
  const notice = await InviteNotice({ next: '/invite/%FF' })
  expect(getInviteByToken).not.toHaveBeenCalled()
  expect(notice?.props.children).toBe(unavailableInviteMessage)
})

it('omits the notice for usable invites and other return paths', async () => {
  const invite = { usable: true } as NonNullable<Awaited<ReturnType<typeof getInviteByToken>>>
  vi.mocked(getInviteByToken).mockResolvedValue(invite)
  expect(await InviteNotice({ next: '/invite/usable' })).toBeNull()
  expect(await InviteNotice({ next: '/works' })).toBeNull()
  expect(getInviteByToken).toHaveBeenCalledTimes(1)
})
