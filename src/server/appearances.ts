import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, entryAppearances, wikiEntries } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { findMentions, type MentionTarget } from '@/lib/korean/mentions'

// Appearances are derived data: rows are recomputed from chapter text whenever a chapter
// is saved or an entry's names change. No actor is taken here; callers check access first.

function namesOf(entry: { name: string; aliases: string[] }): string[] {
  return [entry.name, ...entry.aliases]
}

/** Recomputes the appearance rows of one chapter from its body, against all active entries of the work. */
export async function recomputeAppearances(db: Db, chapterId: string): Promise<void> {
  const [chapter] = await db
    .select({ workId: chapters.workId, body: chapters.body })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1)
  if (!chapter) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')

  const entries = await db
    .select({ id: wikiEntries.id, name: wikiEntries.name, aliases: wikiEntries.aliases })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, chapter.workId), isNull(wikiEntries.archivedAt)))
  const targets: MentionTarget[] = entries.map((e) => ({ id: e.id, names: namesOf(e) }))
  const mentions = findMentions(chapter.body, targets)

  await db.transaction(async (tx) => {
    await tx.delete(entryAppearances).where(eq(entryAppearances.chapterId, chapterId))
    if (mentions.length > 0) {
      await tx
        .insert(entryAppearances)
        .values(mentions.map((m) => ({ entryId: m.entryId, chapterId, mentionCount: m.count })))
    }
  })
}

/**
 * Recomputes one entry's rows across every chapter of its work. Use it after the entry's
 * name or aliases change, or when it is archived or restored (archived entries have no rows).
 */
export async function recomputeAppearancesForEntry(db: Db, entryId: string): Promise<void> {
  const [entry] = await db
    .select({
      workId: wikiEntries.workId,
      name: wikiEntries.name,
      aliases: wikiEntries.aliases,
      archivedAt: wikiEntries.archivedAt,
    })
    .from(wikiEntries)
    .where(eq(wikiEntries.id, entryId))
    .limit(1)
  if (!entry) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')

  const rows = await db
    .select({ id: chapters.id, body: chapters.body })
    .from(chapters)
    .where(eq(chapters.workId, entry.workId))

  await db.transaction(async (tx) => {
    await tx.delete(entryAppearances).where(eq(entryAppearances.entryId, entryId))
    if (entry.archivedAt) return
    const target: MentionTarget = { id: entryId, names: namesOf(entry) }
    const values = rows.flatMap((chapter) => {
      const hit = findMentions(chapter.body, [target])[0]
      return hit ? [{ entryId, chapterId: chapter.id, mentionCount: hit.count }] : []
    })
    if (values.length > 0) await tx.insert(entryAppearances).values(values)
  })
}

/** Chapters where an entry appears, in manuscript order. */
export async function getEntryAppearances(
  db: Db,
  entryId: string,
): Promise<{ chapterId: string; position: number; title: string; mentionCount: number }[]> {
  return db
    .select({
      chapterId: entryAppearances.chapterId,
      position: chapters.position,
      title: chapters.title,
      mentionCount: entryAppearances.mentionCount,
    })
    .from(entryAppearances)
    .innerJoin(chapters, eq(chapters.id, entryAppearances.chapterId))
    .where(eq(entryAppearances.entryId, entryId))
    .orderBy(asc(chapters.position))
}

/** entryId -> position of the earliest chapter where the entry is mentioned. */
export async function getFirstAppearances(db: Db, workId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      entryId: entryAppearances.entryId,
      position: sql<number>`min(${chapters.position})`,
    })
    .from(entryAppearances)
    .innerJoin(chapters, eq(chapters.id, entryAppearances.chapterId))
    .where(and(eq(chapters.workId, workId), gt(entryAppearances.mentionCount, 0)))
    .groupBy(entryAppearances.entryId)
  return new Map(rows.map((r) => [r.entryId, Number(r.position)]))
}
