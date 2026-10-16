import { notFound, redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { isAppError } from '@/lib/errors'
import { type SessionUser, requirePageUser } from '@/server/session'

/** For server components: the signed-in user (redirects to /login otherwise), the db and the actor. */
export async function pageContext(
  nextPath?: string,
): Promise<{ db: Db; actor: Actor; user: SessionUser }> {
  const user = await requirePageUser(nextPath)
  return { db: getDb(), actor: { userId: user.id }, user }
}

/**
 * Runs a service call inside a page. NOT_FOUND shows the 404 page and UNAUTHENTICATED
 * redirects to /login. Other errors propagate to the error boundary.
 */
export async function guardPage<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (isAppError(e)) {
      if (e.code === 'NOT_FOUND') notFound()
      if (e.code === 'UNAUTHENTICATED') redirect('/login')
    }
    throw e
  }
}
