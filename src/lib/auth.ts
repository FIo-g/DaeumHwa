import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { anonymous } from 'better-auth/plugins/anonymous'
import { linkTrialWork } from '@/server/trial-account'
import { account, rateLimit, session, user, verification } from '@/db/auth-schema'
import { getDb } from '@/db/client'

// Built lazily: importing this module must not open the database, because
// `next build` imports it from several page-data workers at once.
function createAuth() {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    // Better Auth limits sign-in and sign-up to 3 requests per IP every 10 seconds in production.
    // The e2e server sets AUTH_RATE_LIMIT=off because every test shares one IP. Leave it unset
    // anywhere else.
    rateLimit: {
      storage: 'database',
      enabled: process.env.AUTH_RATE_LIMIT === 'off' ? false : undefined,
      customRules: { '/sign-in/anonymous': { window: 3600, max: 5 } },
    },
    plugins: [
      anonymous({
        generateName: () => '체험 계정',
        disableDeleteAnonymousUser: true,
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          if (!newUser.user.isAnonymous) {
            await linkTrialWork(getDb(), anonymousUser.user.id, newUser.user.id)
          }
        },
      }),
      nextCookies(),
    ],
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
