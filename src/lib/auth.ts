import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { account, session, user, verification } from '@/db/auth-schema'
import { getDb } from '@/db/client'

// Built lazily: importing this module must not open the database, because
// `next build` imports it from several page-data workers at once.
function createAuth() {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    // Better Auth limits sign-in and sign-up to 3 requests per IP every 10 seconds in production.
    // The e2e server sets AUTH_RATE_LIMIT=off because every test shares one IP. Leave it unset
    // anywhere else.
    rateLimit: process.env.AUTH_RATE_LIMIT === 'off' ? { enabled: false } : undefined,
    plugins: [nextCookies()],
  })
}

export type Auth = ReturnType<typeof createAuth>

const AUTH_KEY = '__daeumhwaAuth' as const

/** Returns the memoized Better Auth instance, creating it on first use. */
export function getAuth(): Auth {
  const holder = globalThis as typeof globalThis & { [AUTH_KEY]?: Auth }
  if (!holder[AUTH_KEY]) holder[AUTH_KEY] = createAuth()
  return holder[AUTH_KEY]
}
