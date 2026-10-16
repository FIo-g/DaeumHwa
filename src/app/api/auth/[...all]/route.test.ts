import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handler: vi.fn(async () => new Response('from-better-auth', { status: 200 })),
}))

vi.mock('@/lib/auth', () => ({
  getAuth: () => ({ handler: mocks.handler }),
}))

// connection() only works inside a Next request scope; the route awaits it first.
vi.mock('next/server', () => ({
  connection: vi.fn(async () => undefined),
}))

import { GET, POST } from './route'

describe('auth route handler', () => {
  it('delegates GET requests to Better Auth', async () => {
    const request = new Request('http://localhost/api/auth/get-session')
    const response = await GET(request)
    expect(mocks.handler).toHaveBeenCalledWith(request)
    expect(await response.text()).toBe('from-better-auth')
  })

  it('delegates POST requests to Better Auth', async () => {
    const request = new Request('http://localhost/api/auth/sign-up/email', { method: 'POST' })
    const response = await POST(request)
    expect(mocks.handler).toHaveBeenCalledWith(request)
    expect(response.status).toBe(200)
  })
})
