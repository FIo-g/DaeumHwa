import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'

const mocks = vi.hoisted(() => ({
  requirePageUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/server/session', () => ({ requirePageUser: mocks.requirePageUser }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))

import { guardPage, pageContext } from './page-helpers'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('pageContext', () => {
  it('returns the db, the actor and the user', async () => {
    mocks.requirePageUser.mockResolvedValue({ id: 'u1', name: '작가', email: 'a@test.local' })
    const ctx = await pageContext('/works/abc')
    expect(mocks.requirePageUser).toHaveBeenCalledWith('/works/abc')
    expect(ctx.actor).toEqual({ userId: 'u1' })
    expect(ctx.user.name).toBe('작가')
    expect(ctx.db).toBeDefined()
  })
})

describe('guardPage', () => {
  it('returns the value of the service call', async () => {
    await expect(guardPage(async () => 42)).resolves.toBe(42)
  })

  it('maps NOT_FOUND to notFound()', async () => {
    await expect(
      guardPage(async () => {
        throw new AppError('NOT_FOUND', '작품을 찾을 수 없습니다.')
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.notFound).toHaveBeenCalled()
  })

  it('maps UNAUTHENTICATED to a redirect to /login', async () => {
    await expect(
      guardPage(async () => {
        throw new AppError('UNAUTHENTICATED', '로그인이 필요합니다.')
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('rethrows other errors unchanged', async () => {
    const forbidden = new AppError('FORBIDDEN', '이 작업을 할 권한이 없습니다.')
    await expect(
      guardPage(async () => {
        throw forbidden
      }),
    ).rejects.toBe(forbidden)
    expect(mocks.notFound).not.toHaveBeenCalled()
  })
})
