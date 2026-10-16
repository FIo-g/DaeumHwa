import { and, asc, count, eq, gt, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  chapters,
  entryAppearances,
  proposals,
  scheduleItems,
  threads,
  wikiEntries,
  works,
} from '@/db/schema'
import { type ScheduleInput, resolveWorkSettings } from '@/db/types'
import { addDays, seoulToday } from '@/lib/dates'
import { computeSchedule } from '@/lib/schedule'

// Periodic checks (spec F8). Computed on request, never stored. The functions take no actor:
// callers check access first (page queries and actions do this).

export type PeriodicAlerts = {
  overdueThreads: {
    id: string
    title: string
    targetPosition: number
    latestPosition: number
    overdueBy: number
  }[]
  absentCharacters: { id: string; name: string; lastPosition: number; chaptersSince: number }[]
  stalePendingCount: number
  bufferWarning: string | null
  total: number
}

/** A pending proposal older than this many days counts as stale. */
const STALE_PROPOSAL_DAYS = 7
/** The schedule warning that starts with this text is the buffer warning. */
const BUFFER_WARNING_PREFIX = '비축분'
/** Thread statuses that still expect a payoff chapter. */
const PAYOFF_OPEN_STATUSES = ['planted', 'developing'] as const

/**
 * Checks a work for things the author should look at: open threads past their payoff
 * chapter, characters missing for too long, proposals waiting more than a week, and a thin
 * buffer of finished chapters. `today` is a Seoul date (`YYYY-MM-DD`).
 */
export async function getPeriodicAlerts(
  db: Db,
  workId: string,
  today: string = seoulToday(),
): Promise<PeriodicAlerts> {
  const [work] = await db
    .select({ settings: works.settings })
    .from(works)
    .where(eq(works.id, workId))
    .limit(1)
  const settings = resolveWorkSettings(work?.settings)

  const chapterRows = await db
    .select({
      id: chapters.id,
      position: chapters.position,
      title: chapters.title,
      status: chapters.status,
      publishedOn: chapters.publishedOn,
    })
    .from(chapters)
    .where(and(eq(chapters.workId, workId), isNull(chapters.archivedAt)))
    .orderBy(asc(chapters.position))
  const latestPosition = chapterRows.reduce((max, c) => Math.max(max, c.position), 0)

  const overdueThreads = await loadOverdueThreads(db, workId, latestPosition)
  const absentCharacters = await loadAbsentCharacters(
    db,
    workId,
    latestPosition,
    settings.absenceThreshold,
  )

  const staleCutoff = new Date(`${addDays(today, -STALE_PROPOSAL_DAYS)}T00:00:00+09:00`)
  const [stale] = await db
    .select({ value: count() })
    .from(proposals)
    .where(
      and(
        eq(proposals.workId, workId),
        eq(proposals.status, 'pending'),
        lt(proposals.createdAt, staleCutoff),
      ),
    )
  const stalePendingCount = stale?.value ?? 0

  const itemRows = await db
    .select({
      id: scheduleItems.id,
      kind: scheduleItems.kind,
      title: scheduleItems.title,
      date: scheduleItems.date,
      endDate: scheduleItems.endDate,
      done: scheduleItems.done,
    })
    .from(scheduleItems)
    .where(eq(scheduleItems.workId, workId))
  const scheduleInput: ScheduleInput = { settings, chapters: chapterRows, items: itemRows }
  const bufferWarning =
    computeSchedule(scheduleInput, today).warnings.find((w) =>
      w.startsWith(BUFFER_WARNING_PREFIX),
    ) ?? null

  const total =
    overdueThreads.length +
    absentCharacters.length +
    (stalePendingCount > 0 ? 1 : 0) +
    (bufferWarning ? 1 : 0)

  return { overdueThreads, absentCharacters, stalePendingCount, bufferWarning, total }
}

/** Open threads whose payoff chapter (target) is before the latest chapter. Most overdue first. */
async function loadOverdueThreads(
  db: Db,
  workId: string,
  latestPosition: number,
): Promise<PeriodicAlerts['overdueThreads']> {
  const rows = await db
    .select({
      id: threads.id,
      title: threads.title,
      targetPosition: threads.targetChapterPosition,
    })
    .from(threads)
    .where(
      and(
        eq(threads.workId, workId),
        isNull(threads.archivedAt),
        inArray(threads.status, [...PAYOFF_OPEN_STATUSES]),
        isNotNull(threads.targetChapterPosition),
      ),
    )
  return rows
    .filter((r): r is typeof r & { targetPosition: number } => r.targetPosition !== null)
    .filter((r) => latestPosition > r.targetPosition)
    .map((r) => ({
      id: r.id,
      title: r.title,
      targetPosition: r.targetPosition,
      latestPosition,
      overdueBy: latestPosition - r.targetPosition,
    }))
    .sort((a, b) => b.overdueBy - a.overdueBy)
}

/**
 * Characters that have appeared at least once and whose last appearance is at least
 * `threshold` chapters before the latest chapter. Longest absence first.
 */
async function loadAbsentCharacters(
  db: Db,
  workId: string,
  latestPosition: number,
  threshold: number,
): Promise<PeriodicAlerts['absentCharacters']> {
  const rows = await db
    .select({
      id: wikiEntries.id,
      name: wikiEntries.name,
      position: chapters.position,
    })
    .from(entryAppearances)
    .innerJoin(wikiEntries, eq(wikiEntries.id, entryAppearances.entryId))
    .innerJoin(chapters, eq(chapters.id, entryAppearances.chapterId))
    .where(
      and(
        eq(wikiEntries.workId, workId),
        eq(wikiEntries.kind, 'character'),
        isNull(wikiEntries.archivedAt),
        isNull(chapters.archivedAt),
        gt(entryAppearances.mentionCount, 0),
      ),
    )

  const lastById = new Map<string, { id: string; name: string; lastPosition: number }>()
  for (const row of rows) {
    const seen = lastById.get(row.id)
    if (!seen || row.position > seen.lastPosition) {
      lastById.set(row.id, { id: row.id, name: row.name, lastPosition: row.position })
    }
  }

  return [...lastById.values()]
    .map((c) => ({ ...c, chaptersSince: latestPosition - c.lastPosition }))
    .filter((c) => c.chaptersSince >= threshold)
    .sort((a, b) => b.chaptersSince - a.chaptersSince)
}
