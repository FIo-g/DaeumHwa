import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, threads, wikiEntries } from '@/db/schema'
import type { Actor, ChangeRow, Role, ThreadStatus, WorkRow } from '@/db/types'
import { seoulToday } from '@/lib/dates'
import { computeSchedule } from '@/lib/schedule'
import { type PeriodicAlerts, getPeriodicAlerts } from '@/server/alerts'
import { listChanges } from '@/server/changes'
import { countOpenIssues } from '@/server/issues'
import { countPendingProposals } from '@/server/proposal-store'
import { getScheduleInput } from '@/server/schedule'
import { listThreads } from '@/server/threads'
import { getResumePoint } from '@/server/user-state'
import { getWork, listMyWorks } from '@/server/works'

// Read-only dashboard queries: the works list cards and the work home page (spec F17, F8).

/** Threads that are still in play: not yet resolved or discarded. */
const OPEN_THREAD_STATUSES: ThreadStatus[] = ['planned', 'planted', 'developing']
const HOME_OPEN_THREAD_LIMIT = 5
const HOME_CHANGE_LIMIT = 5

export type WorkCard = {
  work: WorkRow
  role: Role
  chapterCount: number
  latestPosition: number
  lastEditedAt: Date | null
  pendingCount: number
  openThreadCount: number
  alertCount: number
}

export type WorkHome = {
  work: WorkRow & { role: Role }
  resume: { chapterId: string; position: number; title: string } | null
  latestDraft: { chapterId: string; position: number; title: string } | null
  nextPosition: number
  pendingCount: number
  openThreads: {
    id: string
    title: string
    status: ThreadStatus
    plantedPosition: number | null
    targetPosition: number | null
    overdue: boolean
  }[]
  alerts: PeriodicAlerts
  schedule: {
    bufferCount: number
    nextPublishDate: string | null
    bufferRunsOutOn: string | null
    nextDeadline: { title: string; date: string; daysLeft: number } | null
  }
  recentChanges: ChangeRow[]
  chapterCount: number
  entryCount: number
  openIssueCount: number
}

/** Count, latest position and last edit time of the non-archived chapters of a work. */
async function chapterSummary(db: Db, workId: string) {
  const [row] = await db
    .select({
      count: count(),
      latestPosition: sql<number | null>`max(${chapters.position})`,
      lastEditedAt: sql<Date | string | null>`max(${chapters.updatedAt})`,
    })
    .from(chapters)
    .where(and(eq(chapters.workId, workId), isNull(chapters.archivedAt)))
  return {
    count: Number(row?.count ?? 0),
    latestPosition: Number(row?.latestPosition ?? 0),
    lastEditedAt: row?.lastEditedAt ? new Date(row.lastEditedAt) : null,
  }
}

async function countOpenThreads(db: Db, workId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(threads)
    .where(
      and(
        eq(threads.workId, workId),
        isNull(threads.archivedAt),
        inArray(threads.status, OPEN_THREAD_STATUSES),
      ),
    )
  return row?.value ?? 0
}

async function countEntries(db: Db, workId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), isNull(wikiEntries.archivedAt)))
  return row?.value ?? 0
}

/** Latest activity of a card: the newer of the work's own edit time and its latest chapter save. */
function activityTime(card: WorkCard): number {
  return Math.max(card.work.updatedAt.getTime(), card.lastEditedAt?.getTime() ?? 0)
}

/**
 * Cards for the works list: the caller's works (archived ones only with includeArchived),
 * most recently active first. Chapter saves count as activity, so the order is re-sorted here
 * after the stats are loaded. Membership is the only check, so no other works are listed.
 */
export async function listWorksWithStats(
  db: Db,
  actor: Actor,
  o?: { includeArchived?: boolean },
): Promise<WorkCard[]> {
  const memberships = await listMyWorks(db, actor, o)
  const today = seoulToday()
  const cards = await Promise.all(
    memberships.map(async ({ role, ...work }) => {
      const [chapterStats, pendingCount, openThreadCount, alerts] = await Promise.all([
        chapterSummary(db, work.id),
        countPendingProposals(db, work.id),
        countOpenThreads(db, work.id),
        getPeriodicAlerts(db, work.id, today),
      ])
      return {
        work,
        role,
        chapterCount: chapterStats.count,
        latestPosition: chapterStats.latestPosition,
        lastEditedAt: chapterStats.lastEditedAt,
        pendingCount,
        openThreadCount,
        alertCount: alerts.total,
      }
    }),
  )
  return cards.sort((a, b) => activityTime(b) - activityTime(a))
}

/** Data for the work home page. Viewer role or higher; others get NOT_FOUND. */
export async function getWorkHome(db: Db, actor: Actor, workId: string): Promise<WorkHome> {
  const work = await getWork(db, actor, workId)
  const today = seoulToday()

  const [
    resumePoint,
    chapterStats,
    latestDraft,
    pendingCount,
    openThreadList,
    alerts,
    scheduleInput,
    recentChanges,
    entryCount,
    openIssueCount,
  ] = await Promise.all([
    getResumePoint(db, actor, workId),
    chapterSummary(db, workId),
    loadLatestDraft(db, workId),
    countPendingProposals(db, workId),
    listThreads(db, actor, workId, { statuses: OPEN_THREAD_STATUSES }),
    getPeriodicAlerts(db, workId, today),
    getScheduleInput(db, actor, workId),
    listChanges(db, actor, workId, { limit: HOME_CHANGE_LIMIT }),
    countEntries(db, workId),
    countOpenIssues(db, workId),
  ])

  const schedule = computeSchedule(scheduleInput, today)

  return {
    work,
    resume:
      resumePoint?.chapterId && resumePoint.chapterPosition !== null
        ? {
            chapterId: resumePoint.chapterId,
            position: resumePoint.chapterPosition,
            title: resumePoint.chapterTitle ?? '',
          }
        : null,
    latestDraft,
    nextPosition: chapterStats.latestPosition + 1,
    pendingCount,
    openThreads: openThreadList.slice(0, HOME_OPEN_THREAD_LIMIT).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      plantedPosition: t.plantedPosition,
      targetPosition: t.targetChapterPosition,
      overdue: t.overdue,
    })),
    alerts,
    schedule: {
      bufferCount: schedule.bufferCount,
      nextPublishDate: schedule.slots[0]?.date ?? null,
      bufferRunsOutOn: schedule.bufferRunsOutOn,
      nextDeadline: schedule.nextDeadline
        ? {
            title: schedule.nextDeadline.title,
            date: schedule.nextDeadline.date,
            daysLeft: schedule.nextDeadline.daysLeft,
          }
        : null,
    },
    recentChanges,
    chapterCount: chapterStats.count,
    entryCount,
    openIssueCount,
  }
}

/** The draft chapter with the highest position, or null when there is no draft. */
async function loadLatestDraft(db: Db, workId: string): Promise<WorkHome['latestDraft']> {
  const [row] = await db
    .select({ id: chapters.id, position: chapters.position, title: chapters.title })
    .from(chapters)
    .where(
      and(eq(chapters.workId, workId), eq(chapters.status, 'draft'), isNull(chapters.archivedAt)),
    )
    .orderBy(desc(chapters.position))
    .limit(1)
  return row ? { chapterId: row.id, position: row.position, title: row.title } : null
}
