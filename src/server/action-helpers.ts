import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { type ActionResult, toActionResult } from '@/lib/result'
import { requireUser } from '@/server/session'

/**
 * Wraps a server-action body: checks the session, passes the shared db and the actor,
 * and converts thrown errors into an ActionResult (actions never throw).
 */
export async function withAction<T>(
  fn: (db: Db, actor: Actor) => Promise<T>,
): Promise<ActionResult<T>> {
  return toActionResult(async () => {
    const user = await requireUser()
    return fn(getDb(), { userId: user.id })
  })
}

/** Refreshes the cached pages of one work and the works list after a write. */
export function revalidateWork(workId: string): void {
  revalidatePath(`/works/${workId}`, 'layout')
  revalidatePath('/works')
}
