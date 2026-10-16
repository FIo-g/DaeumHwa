import { asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  changeLog,
  chapters,
  facts,
  namingRules,
  relations,
  scheduleItems,
  styleCards,
  threadEntries,
  threadEvents,
  threads,
  wikiEntries,
  works,
} from '@/db/schema'
import type { Actor, ExportPayload } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireWorkRole } from '@/server/access'

/**
 * Whole-work backup payload (owner only). Includes archived rows; every query is scoped to
 * `workId`. Reads run in one read-only REPEATABLE READ transaction so the rows form a single
 * consistent snapshot.
 */
export async function buildExportPayload(
  db: Db,
  actor: Actor,
  workId: string,
): Promise<ExportPayload> {
  await requireWorkRole(db, workId, actor.userId, 'owner')

  return db.transaction(
    async (tx) => {
      const [work] = await tx.select().from(works).where(eq(works.id, workId)).limit(1)
      if (!work) throw new AppError('NOT_FOUND', '작품을 찾을 수 없습니다.')

      const chapterRows = await tx
        .select()
        .from(chapters)
        .where(eq(chapters.workId, workId))
        .orderBy(asc(chapters.position), asc(chapters.id))
      const entries = await tx
        .select()
        .from(wikiEntries)
        .where(eq(wikiEntries.workId, workId))
        .orderBy(asc(wikiEntries.createdAt), asc(wikiEntries.id))
      const factRows = await tx
        .select()
        .from(facts)
        .where(eq(facts.workId, workId))
        .orderBy(asc(facts.createdAt), asc(facts.id))
      const threadRows = await tx
        .select()
        .from(threads)
        .where(eq(threads.workId, workId))
        .orderBy(asc(threads.createdAt), asc(threads.id))
      const threadIds = threadRows.map((t) => t.id)

      // Thread children have no work_id column; they are reached through their thread.
      const eventRows =
        threadIds.length === 0
          ? []
          : await tx
              .select()
              .from(threadEvents)
              .where(inArray(threadEvents.threadId, threadIds))
              .orderBy(asc(threadEvents.createdAt), asc(threadEvents.id))
      const threadEntryRows =
        threadIds.length === 0
          ? []
          : await tx
              .select({ threadId: threadEntries.threadId, entryId: threadEntries.entryId })
              .from(threadEntries)
              .where(inArray(threadEntries.threadId, threadIds))

      const relationRows = await tx
        .select()
        .from(relations)
        .where(eq(relations.workId, workId))
        .orderBy(asc(relations.createdAt), asc(relations.id))
      const namingRuleRows = await tx
        .select()
        .from(namingRules)
        .where(eq(namingRules.workId, workId))
        .orderBy(asc(namingRules.createdAt), asc(namingRules.id))
      const styleCardRows = await tx
        .select()
        .from(styleCards)
        .where(eq(styleCards.workId, workId))
        .orderBy(asc(styleCards.createdAt), asc(styleCards.id))
      const changeRows = await tx
        .select()
        .from(changeLog)
        .where(eq(changeLog.workId, workId))
        .orderBy(asc(changeLog.createdAt), asc(changeLog.id))
      const scheduleRows = await tx
        .select()
        .from(scheduleItems)
        .where(eq(scheduleItems.workId, workId))
        .orderBy(asc(scheduleItems.date), asc(scheduleItems.id))

      return {
        format: 'daeumhwa-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        work,
        chapters: chapterRows,
        entries,
        facts: factRows,
        threads: threadRows,
        threadEvents: eventRows,
        threadEntries: threadEntryRows,
        relations: relationRows,
        namingRules: namingRuleRows,
        styleCards: styleCardRows,
        changes: changeRows,
        scheduleItems: scheduleRows,
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}
