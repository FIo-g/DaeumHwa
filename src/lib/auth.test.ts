import { drizzle } from 'drizzle-orm/postgres-js'
import { afterEach, expect, it, vi } from 'vitest'
import { getAuth } from './auth'

vi.mock('@/db/client', () => ({ getDb: () => drizzle.mock() }))

afterEach(() => vi.unstubAllEnvs())

it('uses database storage for auth rate limiting', async () => {
  vi.stubEnv('AUTH_RATE_LIMIT', undefined)
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-for-auth-rate-limiting-only')

  const context = await getAuth().$context
  expect(context.rateLimit.storage).toBe('database')
  await context.explicitSchemaCheck?.()
})
