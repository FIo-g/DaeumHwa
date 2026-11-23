// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draftKey, getDraft, saveDraft } from '@/lib/client/local-store'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  flushPendingSaves: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: mocks.signOut } }))
vi.mock('@/lib/client/use-autosave', () => ({ flushPendingSaves: mocks.flushPendingSaves }))

import { TopBar } from './top-bar'

const user = { id: 'user-1', name: '작가', email: 'writer@test.local' }
const key = draftKey(user.id, 'chapter-3')
const draft = { title: '3화', body: '저장하지 못한 본문', savedAt: 1, baseVersion: 1 }

beforeEach(async () => {
  mocks.replace.mockClear()
  mocks.refresh.mockClear()
  mocks.signOut.mockReset().mockResolvedValue({ error: null })
  mocks.flushPendingSaves.mockReset()
  await saveDraft(key, draft)
})

afterEach(() => {
  cleanup()
})

describe('TopBar sign-out', () => {
  it('keeps a closed chapter draft on sign-out when the flush succeeds', async () => {
    mocks.flushPendingSaves.mockResolvedValue(true)
    render(<TopBar user={user} />)
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'))
    expect(mocks.flushPendingSaves).toHaveBeenCalledTimes(1)
    expect(await getDraft(key)).toEqual(draft)
  })

  it('keeps drafts on the device when an edit could not be saved', async () => {
    mocks.flushPendingSaves.mockResolvedValue(false)
    render(<TopBar user={user} />)
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'))
    expect(await getDraft(key)).toEqual(draft)
  })

  it('keeps drafts when sign-out itself fails', async () => {
    mocks.flushPendingSaves.mockResolvedValue(true)
    mocks.signOut.mockResolvedValue({ error: { message: 'fail' } })
    render(<TopBar user={user} />)
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(await getDraft(key)).toEqual(draft)
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
