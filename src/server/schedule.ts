import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, scheduleItems, works } from '@/db/schema'
import {
  type Actor,
  type ScheduleInput,
  type ScheduleItemRow,
  type ScheduleKind,
  SCHEDULE_KINDS,
  resolveWorkSettings,
} from '@/db/types'
import { AppError } from '@/lib/errors'
import { daysBetween, addDays } from '@/lib/dates'
import { SCHEDULE_KIND_LABEL } from '@/lib/labels'
import { requireRowWork, requireWorkRole } from '@/server/access'

// Publishing schedule items (spec F15). Dates are Asia/Seoul calendar dates (`YYYY-MM-DD`).
// Schedule items are not wiki rows, so they are hard-deleted.

export type CreateScheduleInput = {
  workId: string
  kind: ScheduleKind
  title: string
  date: string
  endDate?: string | null
  chapterId?: string | null
  note?: string
}

export type ScheduleItemPatch = {
  kind?: ScheduleKind
  title?: string
  date?: string
  endDate?: string | null
  chapterId?: string | null
  note?: string
}

function assertKind(kind: string): asserts kind is ScheduleKind {
  if (!(SCHEDULE_KINDS as readonly string[]).includes(kind)) {
    throw new AppError('VALIDATION', '일정 종류가 올바르지 않습니다.')
  }
}

/** Checks `YYYY-MM-DD` and that the date exists on the calendar. */
function assertDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) {
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
    const check = new Date(Date.UTC(y, m - 1, d))
    if (check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d) {
      return
    }
  }
  throw new AppError('VALIDATION', '날짜 형식이 올바르지 않습니다.')
}

/** Empty titles fall back to the kind's Korean label. */
function normalizeTitle(title: string, kind: ScheduleKind): string {
  return title.trim() || SCHEDULE_KIND_LABEL[kind]
}

/** A hiatus with no end date is a single-day hiatus. The end may not come before the start. */
function normalizeTiming(
  kind: ScheduleKind,
  date: string,
  endDate: string | null,
): { date: string; endDate: string | null } {
  assertDate(date)
  let end = endDate
  if (kind === 'hiatus' && end === null) end = date
  if (end !== null) {
    assertDate(end)
    if (end < date) throw new AppError('VALIDATION', '끝나는 날이 시작일보다 빠릅니다.')
  }
  return { date, endDate: end }
}

async function assertChapterInWork(db: Db, workId: string, chapterId: string): Promise<void> {
  const [chapter] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.id, chapterId), eq(chapters.workId, workId)))
    .limit(1)
  if (!chapter) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
}

/** Schedule items of a work, by start date. With a range, only items overlapping it. Viewer role or higher. */
export async function listScheduleItems(
  db: Db,
  actor: Actor,
  workId: string,
  range?: { from: string; to: string },
): Promise<ScheduleItemRow[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions = [eq(scheduleItems.workId, workId)]
  if (range) {
    assertDate(range.from)
    assertDate(range.to)
    // An item overlaps the range when it starts on or before `to` and ends on or after `from`.
    conditions.push(lte(scheduleItems.date, range.to))
    conditions.push(gte(sql`coalesce(${scheduleItems.endDate}, ${scheduleItems.date})`, range.from))
  }
  return db
    .select()
    .from(scheduleItems)
    .where(and(...conditions))
    .orderBy(asc(scheduleItems.date), asc(scheduleItems.createdAt))
}

/** Adds a schedule item. Editor role or higher. */
export async function createScheduleItem(
  db: Db,
  actor: Actor,
  input: CreateScheduleInput,
): Promise<ScheduleItemRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  assertKind(input.kind)
  const timing = normalizeTiming(input.kind, input.date, input.endDate ?? null)
  if (input.chapterId) await assertChapterInWork(db, input.workId, input.chapterId)
  const [row] = await db
    .insert(scheduleItems)
    .values({
      workId: input.workId,
      kind: input.kind,
      title: normalizeTitle(input.title, input.kind),
      date: timing.date,
      endDate: timing.endDate,
      chapterId: input.chapterId ?? null,
      note: input.note ?? '',
      done: false,
    })
    .returning()
  return row
}

/**
 * Edits a schedule item. Editor role or higher. When only the start date changes, the item
 * keeps its length: an end date moves with the start.
 */
export async function updateScheduleItem(
  db: Db,
  actor: Actor,
  itemId: string,
  patch: ScheduleItemPatch,
): Promise<ScheduleItemRow> {
  const workId = await requireRowWork(db, 'schedule_items', itemId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [current] = await db
    .select()
    .from(scheduleItems)
    .where(eq(scheduleItems.id, itemId))
    .limit(1)
  if (!current) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')

  const kind = patch.kind ?? current.kind
  assertKind(kind)
  const date = patch.date ?? current.date
  let endDate: string | null
  if (patch.endDate !== undefined) {
    endDate = patch.endDate
  } else if (patch.date !== undefined && current.endDate !== null) {
    endDate = addDays(date, daysBetween(current.date, current.endDate))
  } else {
    endDate = current.endDate
  }
  const timing = normalizeTiming(kind, date, endDate)
  if (patch.chapterId) await assertChapterInWork(db, workId, patch.chapterId)

  const [updated] = await db
    .update(scheduleItems)
    .set({
      kind,
      title: patch.title !== undefined ? normalizeTitle(patch.title, kind) : current.title,
      date: timing.date,
      endDate: timing.endDate,
      chapterId: patch.chapterId !== undefined ? patch.chapterId : current.chapterId,
      note: patch.note ?? current.note,
      updatedAt: new Date(),
    })
    .where(eq(scheduleItems.id, itemId))
    .returning()
  return updated
}

/** Deletes a schedule item. Editor role or higher. */
export async function deleteScheduleItem(db: Db, actor: Actor, itemId: string): Promise<void> {
  const workId = await requireRowWork(db, 'schedule_items', itemId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  await db.delete(scheduleItems).where(eq(scheduleItems.id, itemId))
}

/** Marks a schedule item as done or not done. Editor role or higher. */
export async function setScheduleItemDone(
  db: Db,
  actor: Actor,
  input: { itemId: string; done: boolean },
): Promise<ScheduleItemRow> {
  const workId = await requireRowWork(db, 'schedule_items', input.itemId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [updated] = await db
    .update(scheduleItems)
    .set({ done: input.done, updatedAt: new Date() })
    .where(eq(scheduleItems.id, input.itemId))
    .returning()
  if (!updated) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return updated
}

/**
 * Input for the schedule calculation in the browser worker: resolved work settings, the
 * chapters that are not archived (by position), and all schedule items. Viewer role or higher.
 */
export async function getScheduleInput(
  db: Db,
  actor: Actor,
  workId: string,
): Promise<ScheduleInput> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const [work] = await db
    .select({ settings: works.settings })
    .from(works)
    .where(eq(works.id, workId))
    .limit(1)
  if (!work) throw new AppError('NOT_FOUND', '작품을 찾을 수 없습니다.')

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
    .orderBy(asc(scheduleItems.date), asc(scheduleItems.createdAt))

  return {
    settings: resolveWorkSettings(work.settings),
    chapters: chapterRows,
    items: itemRows,
  }
}
