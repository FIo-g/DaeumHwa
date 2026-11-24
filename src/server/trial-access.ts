import { and, eq, gt, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { session, user } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { TRIAL_SIGNUP_MESSAGE } from '@/lib/trial'

export async function isTrialUser(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isAnonymous: user.isAnonymous })
    .from(user)
    .where(eq(user.id, userId))
  return row?.isAnonymous === true
}

export async function requireRegisteredUser(db: Db, userId: string): Promise<void> {
  if (await isTrialUser(db, userId)) throw new AppError('FORBIDDEN', TRIAL_SIGNUP_MESSAGE)
}

/** Call inside a transaction before provisioning or transferring the trial's work. */
export async function lockActiveTrial(db: Db, userId: string): Promise<boolean> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
  const [activeSession] = await db
    .select({ id: session.id })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
    .limit(1)
  return Boolean(activeSession)
}
