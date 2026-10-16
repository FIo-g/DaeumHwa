import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  aiRuns,
  changeLog,
  chapterVersions,
  chapters,
  comments,
  facts,
  interviewSessions,
  interviewTurns,
  issues,
  namingRules,
  proposals,
  relations,
  scheduleItems,
  styleCards,
  threadEntries,
  threadEvents,
  threads,
  wikiEntries,
  works,
} from '@/db/schema'
import type { ExportPayload, Actor, AiTaskName } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireWorkRole } from '@/server/access'

/** AI tasks whose finished outputs belong in the backup (authored content, not every AI call). */
const EXPORTED_AI_TASKS: AiTaskName[] = ['reader-sim', 'direction-advice', 'draft-chapter']

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
      const chapterIds = chapterRows.map((c) => c.id)

      // Chapter versions have no work_id column; they are reached through their chapter.
      const chapterVersionRows =
        chapterIds.length === 0
          ? []
          : await tx
              .select()
              .from(chapterVersions)
              .where(inArray(chapterVersions.chapterId, chapterIds))
              .orderBy(asc(chapterVersions.createdAt), asc(chapterVersions.id))
      const commentRows = await tx
        .select()
        .from(comments)
        .where(eq(comments.workId, workId))
        .orderBy(asc(comments.createdAt), asc(comments.id))
      const issueRows = await tx
        .select()
        .from(issues)
        .where(eq(issues.workId, workId))
        .orderBy(asc(issues.createdAt), asc(issues.id))
      const proposalRows = await tx
        .select()
        .from(proposals)
        .where(eq(proposals.workId, workId))
        .orderBy(asc(proposals.createdAt), asc(proposals.id))
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

      // Interview turns have no work_id column; they are reached through their session.
      const interviewSessionRows = await tx
        .select()
        .from(interviewSessions)
        .where(eq(interviewSessions.workId, workId))
        .orderBy(asc(interviewSessions.createdAt), asc(interviewSessions.id))
      const sessionIds = interviewSessionRows.map((s) => s.id)
      const interviewTurnRows =
        sessionIds.length === 0
          ? []
          : await tx
              .select()
              .from(interviewTurns)
              .where(inArray(interviewTurns.sessionId, sessionIds))
              .orderBy(asc(interviewTurns.createdAt), asc(interviewTurns.id))
      const aiRunRows = await tx
        .select()
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.workId, workId),
            eq(aiRuns.status, 'done'),
            inArray(aiRuns.task, EXPORTED_AI_TASKS),
          ),
        )
        .orderBy(asc(aiRuns.createdAt), asc(aiRuns.id))

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
        chapterVersions: chapterVersionRows,
        entries,
        facts: factRows,
        threads: threadRows,
        threadEvents: eventRows,
        threadEntries: threadEntryRows,
        relations: relationRows,
        namingRules: namingRuleRows,
        styleCards: styleCardRows,
        comments: commentRows,
        issues: issueRows,
        proposals: proposalRows,
        interviewSessions: interviewSessionRows,
        interviewTurns: interviewTurnRows,
        aiRuns: aiRunRows,
        changes: changeRows,
        scheduleItems: scheduleRows,
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}
