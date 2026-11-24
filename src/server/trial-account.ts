import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  aiRuns,
  changeLog,
  chapterVersions,
  session,
  userWorkState,
  workMembers,
  works,
} from '@/db/schema'
import { lockActiveTrial } from './trial-access'

/** Transfers the read-only sample and its history after Better Auth signs in the permanent user. */
export async function linkTrialWork(db: Db, trialUserId: string, newUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await lockActiveTrial(tx, trialUserId))) return

    const [sample] = await tx
      .update(works)
      .set({ ownerId: newUserId })
      .where(eq(works.ownerId, trialUserId))
      .returning({ id: works.id })
    if (sample) {
      await tx
        .update(workMembers)
        .set({ userId: newUserId, role: 'owner' })
        .where(and(eq(workMembers.workId, sample.id), eq(workMembers.userId, trialUserId)))
      await tx
        .update(chapterVersions)
        .set({ createdBy: newUserId })
        .where(eq(chapterVersions.createdBy, trialUserId))
      await tx
        .update(changeLog)
        .set({ actorId: newUserId })
        .where(eq(changeLog.actorId, trialUserId))
      await tx.update(aiRuns).set({ userId: newUserId }).where(eq(aiRuns.userId, trialUserId))
      await tx
        .update(userWorkState)
        .set({ userId: newUserId })
        .where(eq(userWorkState.userId, trialUserId))
    }
    await tx.delete(session).where(eq(session.userId, trialUserId))
  })
}
