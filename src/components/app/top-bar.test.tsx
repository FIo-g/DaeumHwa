// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  flushPendingSaves: vi.fn(),
  clearUserDrafts: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: mocks.signOut } }))
vi.mock('@/lib/client/use-autosave', () => ({ flushPendingSaves: mocks.flushPendingSaves }))
vi.mock('@/lib/client/local-store', () => ({ clearUserDrafts: mocks.clearUserDrafts }))

import { TopBar } from './top-bar'

const user = { id: 'user-1', name: '작가', email: 'writer@test.local' }

beforeEach(() => {
  mocks.replace.mockClear()
  mocks.refresh.mockClear()
  mocks.signOut.mockReset().mockResolvedValue({ error: null })
  mocks.flushPendingSaves.mockReset()
  mocks.clearUserDrafts.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('TopBar sign-out', () => {
  it('saves open edits, then clears only this user drafts and leaves', async () => {
    mocks.flushPendingSaves.mockResolvedValue(true)
    render(<TopBar user={user} />)
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'))
    expect(mocks.flushPendingSaves).toHaveBeenCalledTimes(1)
    expect(mocks.clearUserDrafts).toHaveBeenCalledWith('user-1')
  })

  it('keeps drafts on the device when an edit could not be saved', async () => {
    mocks.flushPendingSaves.mockResolvedValue(false)
    render(<TopBar user={user} />)
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'))
    expect(mocks.clearUserDrafts).not.toHaveBeenCalled()
  })

  it('keeps drafts when sign-out itself fails', async () => {
    mocks.flushPendingSaves.mockResolvedValue(true)
    mocks.signOut.mockResolvedValue({ error: { message: 'fail' } })
    render(<TopBar user={user} />)
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.clearUserDrafts).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
