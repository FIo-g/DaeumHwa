import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuth } from '@/lib/auth'
import { AppError } from '@/lib/errors'

export type SessionUser = { id: string; name: string; email: string }

/** Returns the signed-in user for this request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return null
  const { id, name, email } = session.user
  return { id, name, email }
}

/** For server actions and route handlers: throws when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AppError('UNAUTHENTICATED', '로그인이 필요합니다.')
  return user
}

/** For server components and pages: redirects to /login when signed out. */
export async function requirePageUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login')
  }
  return user
}
