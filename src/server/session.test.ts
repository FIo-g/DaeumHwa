import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.getSession } }),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'x=1' }),
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

import { getSessionUser, requirePageUser, requireUser } from './session'

const signedIn = {
  session: { id: 's1' },
  user: { id: 'u1', name: '테스트', email: 't@test.local', image: null },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getSessionUser', () => {
  it('returns the id, name and email of the signed-in user', async () => {
    mocks.getSession.mockResolvedValue(signedIn)
    await expect(getSessionUser()).resolves.toEqual({
      id: 'u1',
      name: '테스트',
      email: 't@test.local',
    })
  })

  it('reads the session from the request headers', async () => {
    mocks.getSession.mockResolvedValue(signedIn)
    await getSessionUser()
    const arg = mocks.getSession.mock.calls[0][0] as { headers: Headers }
    expect(arg.headers.get('cookie')).toBe('x=1')
  })

  it('returns null when there is no session', async () => {
    mocks.getSession.mockResolvedValue(null)
    await expect(getSessionUser()).resolves.toBeNull()
  })
})

describe('requireUser', () => {
  it('returns the user when signed in', async () => {
    mocks.getSession.mockResolvedValue(signedIn)
    await expect(requireUser()).resolves.toEqual({
      id: 'u1',
      name: '테스트',
      email: 't@test.local',
    })
  })

  it('throws UNAUTHENTICATED with a Korean message when signed out', async () => {
    mocks.getSession.mockResolvedValue(null)
    const error = await requireUser().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('UNAUTHENTICATED')
    expect((error as AppError).message).toBe('로그인이 필요합니다.')
  })
})

describe('requirePageUser', () => {
  it('returns the user when signed in', async () => {
    mocks.getSession.mockResolvedValue(signedIn)
    await expect(requirePageUser('/works')).resolves.toMatchObject({ id: 'u1' })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('redirects to /login with the encoded next path when signed out', async () => {
    mocks.getSession.mockResolvedValue(null)
    await expect(requirePageUser('/works/w1/chapters?x=1&y=2')).rejects.toThrow(
      'NEXT_REDIRECT:/login?next=%2Fworks%2Fw1%2Fchapters%3Fx%3D1%26y%3D2',
    )
  })

  it('redirects to plain /login when no next path is given', async () => {
    mocks.getSession.mockResolvedValue(null)
    await expect(requirePageUser()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mocks.redirect).toHaveBeenCalledWith('/login')
  })
})
