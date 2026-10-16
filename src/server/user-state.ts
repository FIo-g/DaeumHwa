import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, userWorkState, workMembers, works } from '@/db/schema'
import type { Actor } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireWorkRole } from '@/server/access'

// Per-user reading and writing position ("이어쓰기"). One row per (user, work).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResumePoint = {
  workId: string
  workTitle: string
  chapterId: string | null
  chapterTitle: string | null
  chapterPosition: number | null
  cursor: number | null
  path: string
  updatedAt: Date
}

/**
 * Stores where the caller left off in a work. `chapterId` and `cursor` are kept when omitted
 * and cleared when passed as null. Viewer role or higher (the state is per user, not per role).
 */
export async function saveResumePoint(
  db: Db,
  actor: Actor,
  input: { workId: string; chapterId?: string | null; cursor?: number | null; path: string },
): Promise<void> {
  await requireWorkRole(db, input.workId, actor.userId, 'viewer')

  if (input.chapterId) {
    if (!UUID_RE.test(input.chapterId)) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
    const [chapter] = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(and(eq(chapters.id, input.chapterId), eq(chapters.workId, input.workId)))
      .limit(1)
    if (!chapter) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
  }

  const now = new Date()
  const update: Partial<typeof userWorkState.$inferInsert> = {
    lastPath: input.path,
    updatedAt: now,
  }
  if (input.chapterId !== undefined) update.lastChapterId = input.chapterId
  if (input.cursor !== undefined) update.lastCursor = input.cursor

  await db
    .insert(userWorkState)
    .values({
      userId: actor.userId,
      workId: input.workId,
      lastChapterId: input.chapterId ?? null,
      lastCursor: input.cursor ?? null,
      lastPath: input.path,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userWorkState.userId, userWorkState.workId],
      set: update,
    })
}

/**
 * The resume point of one work (when `workId` is given) or the most recently saved one across
 * the caller's works. Archived works are skipped. An archived or deleted chapter is reported as
 * no chapter (its cursor is dropped too). Returns null when there is nothing to resume.
 */
export async function getResumePoint(
  db: Db,
  actor: Actor,
  workId?: string,
): Promise<ResumePoint | null> {
  if (workId !== undefined) await requireWorkRole(db, workId, actor.userId, 'viewer')

  const conditions = [eq(userWorkState.userId, actor.userId), eq(works.status, 'active')]
  if (workId !== undefined) conditions.push(eq(userWorkState.workId, workId))

  const [row] = await db
    .select({
      state: userWorkState,
      workTitle: works.title,
      chapterTitle: chapters.title,
      chapterPosition: chapters.position,
      chapterArchivedAt: chapters.archivedAt,
    })
    .from(userWorkState)
    .innerJoin(works, eq(works.id, userWorkState.workId))
    // Membership is checked here too, so a work I have left is not offered.
    .innerJoin(
      workMembers,
      and(eq(workMembers.workId, userWorkState.workId), eq(workMembers.userId, actor.userId)),
    )
    .leftJoin(chapters, eq(chapters.id, userWorkState.lastChapterId))
    .where(and(...conditions))
    .orderBy(desc(userWorkState.updatedAt))
    .limit(1)
  if (!row) return null

  const chapterLive = row.chapterPosition !== null && row.chapterArchivedAt === null
  return {
    workId: row.state.workId,
    workTitle: row.workTitle,
    chapterId: chapterLive ? row.state.lastChapterId : null,
    chapterTitle: chapterLive ? row.chapterTitle : null,
    chapterPosition: chapterLive ? row.chapterPosition : null,
    cursor: chapterLive ? row.state.lastCursor : null,
    path: row.state.lastPath,
    updatedAt: row.state.updatedAt,
  }
}
