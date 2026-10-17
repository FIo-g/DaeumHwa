import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { workMembers, works } from '@/db/schema'
import type { Actor, Role, WorkRow, WorkSettings } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireWorkRole } from '@/server/access'

export type CreateWorkInput = {
  title: string
  genre?: string
  logline?: string
  synopsis?: string
}

export type UpdateWorkPatch = {
  title?: string
  genre?: string
  logline?: string
  synopsis?: string
  settings?: WorkSettings
}

function requireTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) throw new AppError('VALIDATION', '작품 제목을 입력해 주세요.')
  return trimmed
}

/** Creates a work; the creator becomes its owner member in the same transaction. */
export async function createWork(db: Db, actor: Actor, input: CreateWorkInput): Promise<WorkRow> {
  const title = requireTitle(input.title)
  return db.transaction(async (tx) => {
    const [work] = await tx
      .insert(works)
      .values({
        ownerId: actor.userId,
        title,
        genre: input.genre ?? '',
        logline: input.logline ?? '',
        synopsis: input.synopsis ?? '',
      })
      .returning()
    await tx.insert(workMembers).values({ workId: work.id, userId: actor.userId, role: 'owner' })
    return work
  })
}

/**
 * Works the caller is a member of, ordered by the work's own updatedAt (metadata edits only;
 * chapter saves do not bump it). Archived works only with includeArchived.
 * Use listWorksWithStats for the activity-based order shown on the works list.
 */
export async function listMyWorks(
  db: Db,
  actor: Actor,
  o?: { includeArchived?: boolean },
): Promise<(WorkRow & { role: Role })[]> {
  const conditions = [eq(workMembers.userId, actor.userId)]
  if (!o?.includeArchived) conditions.push(eq(works.status, 'active'))
  const rows = await db
    .select({ work: works, role: workMembers.role })
    .from(workMembers)
    .innerJoin(works, eq(works.id, workMembers.workId))
    .where(and(...conditions))
    .orderBy(desc(works.updatedAt))
  return rows.map((r) => ({ ...r.work, role: r.role }))
}

/** One work with the caller's role. Viewer role or higher; others get NOT_FOUND. */
export async function getWork(
  db: Db,
  actor: Actor,
  workId: string,
): Promise<WorkRow & { role: Role }> {
  const { role } = await requireWorkRole(db, workId, actor.userId, 'viewer')
  const [work] = await db.select().from(works).where(eq(works.id, workId)).limit(1)
  if (!work) throw new AppError('NOT_FOUND', '작품을 찾을 수 없습니다.')
  return { ...work, role }
}

/** Owner only. Settings are shallow-merged into the stored settings; defaults apply on read. */
export async function updateWork(
  db: Db,
  actor: Actor,
  workId: string,
  patch: UpdateWorkPatch,
): Promise<WorkRow> {
  await requireWorkRole(db, workId, actor.userId, 'owner')
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(works).where(eq(works.id, workId)).limit(1)
    if (!current) throw new AppError('NOT_FOUND', '작품을 찾을 수 없습니다.')
    const values: Partial<typeof works.$inferInsert> = { updatedAt: new Date() }
    if (patch.title !== undefined) values.title = requireTitle(patch.title)
    if (patch.genre !== undefined) values.genre = patch.genre
    if (patch.logline !== undefined) values.logline = patch.logline
    if (patch.synopsis !== undefined) values.synopsis = patch.synopsis
    if (patch.settings !== undefined) {
      values.settings = { ...current.settings, ...patch.settings }
    }
    const [updated] = await tx.update(works).set(values).where(eq(works.id, workId)).returning()
    return updated
  })
}

/** Owner only. Archived works disappear from the default list but keep all their data. */
export async function setWorkArchived(
  db: Db,
  actor: Actor,
  workId: string,
  archived: boolean,
): Promise<WorkRow> {
  await requireWorkRole(db, workId, actor.userId, 'owner')
  const [updated] = await db
    .update(works)
    .set({ status: archived ? 'archived' : 'active', updatedAt: new Date() })
    .where(eq(works.id, workId))
    .returning()
  if (!updated) throw new AppError('NOT_FOUND', '작품을 찾을 수 없습니다.')
  return updated
}
