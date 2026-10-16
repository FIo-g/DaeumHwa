import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, proposals } from '@/db/schema'
import type { ProposalRow, ProposalSource } from '@/db/types'
import { AppError } from '@/lib/errors'
import { type NewProposal, parseProposalPayload } from '@/lib/proposal-payloads'

// Storage for AI and import proposals. Nothing here writes wiki tables: approval is a
// separate step (proposals.ts). Callers check access before calling these functions.

/**
 * Validates every payload, then inserts all proposals in one statement as pending rows.
 * Chapter references must belong to the same work.
 */
export async function insertProposals(
  db: Db,
  workId: string,
  items: NewProposal[],
): Promise<ProposalRow[]> {
  if (items.length === 0) return []

  const values = items.map((item) => ({
    workId,
    type: item.type,
    payload: parseProposalPayload(item.type, item.payload),
    source: item.source,
    sourceRef: item.sourceRef,
    chapterId: item.chapterId,
  }))

  const chapterIds = [
    ...new Set(values.map((v) => v.chapterId).filter((id): id is string => id !== null)),
  ]
  if (chapterIds.length > 0) {
    const found = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(and(eq(chapters.workId, workId), inArray(chapters.id, chapterIds)))
    if (found.length !== chapterIds.length) {
      throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
    }
  }

  return db.insert(proposals).values(values).returning()
}

/** Deletes pending proposals of one source (and optionally one chapter or sourceRef). Approved and rejected rows stay. */
export async function deletePendingProposals(
  db: Db,
  where: { workId: string; source: ProposalSource; chapterId?: string; sourceRef?: string },
): Promise<number> {
  const conditions = [
    eq(proposals.workId, where.workId),
    eq(proposals.source, where.source),
    eq(proposals.status, 'pending'),
  ]
  if (where.chapterId !== undefined) conditions.push(eq(proposals.chapterId, where.chapterId))
  if (where.sourceRef !== undefined) conditions.push(eq(proposals.sourceRef, where.sourceRef))
  const deleted = await db
    .delete(proposals)
    .where(and(...conditions))
    .returning({ id: proposals.id })
  return deleted.length
}

/** Number of proposals waiting for a decision in a work. */
export async function countPendingProposals(db: Db, workId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(proposals)
    .where(and(eq(proposals.workId, workId), eq(proposals.status, 'pending')))
  return row?.count ?? 0
}
