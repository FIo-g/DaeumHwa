// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { acceptInviteAction } from '@/server/actions/members'
import { AcceptInvite } from './accept-invite'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/server/actions/members', () => ({
  acceptInviteAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const accept = vi.mocked(acceptInviteAction)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('AcceptInvite', () => {
  it('names the inviter, work and role in the invitation sentence', () => {
    render(<AcceptInvite token="tok-1" inviterName="김작가" workTitle="별빛 계약" role="editor" />)
    expect(
      screen.getByText("김작가님이 '별빛 계약' 작품에 편집자로 초대했습니다."),
    ).toBeInTheDocument()
  })

  it('uses the 으로 particle when the role label ends in a final consonant', () => {
    render(<AcceptInvite token="tok-1" inviterName="김작가" workTitle="별빛 계약" role="viewer" />)
    expect(
      screen.getByText("김작가님이 '별빛 계약' 작품에 보기 전용으로 초대했습니다."),
    ).toBeInTheDocument()
  })

  it('joins the work and opens its home page', async () => {
    run.mockResolvedValue({ workId: 'w1' } as never)
    render(
      <AcceptInvite token="tok-1" inviterName="김작가" workTitle="별빛 계약" role="commenter" />,
    )
    fireEvent.click(screen.getByRole('button', { name: '참여하기' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/works/w1'))
    expect(accept).toHaveBeenCalledWith({ token: 'tok-1' })
  })

  it('stays on the page when joining fails', async () => {
    run.mockResolvedValue(null)
    render(<AcceptInvite token="tok-1" inviterName="김작가" workTitle="별빛 계약" role="editor" />)
    fireEvent.click(screen.getByRole('button', { name: '참여하기' }))

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '참여하기' })).toBeEnabled()
  })
})
