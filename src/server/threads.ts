import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, threadEntries, threadEvents, threads, wikiEntries } from '@/db/schema'
import type {
  Actor,
  Importance,
  ProposerType,
  ThreadEventKind,
  ThreadEventRow,
  ThreadRow,
  ThreadStatus,
} from '@/db/types'
import { AppError } from '@/lib/errors'
import { THREAD_EVENT_LABEL, THREAD_STATUS_LABEL } from '@/lib/labels'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { recordChange, syncThreadFromEvents, threadSnapshot } from '@/server/changes'

// Threads (떡밥) are the foreshadowing ledger. Every write records change_log rows in the same
// transaction. Thread status moves only through addThreadEvent (the ordering rules live there).

/** Shape shared with the wiki services: who proposed the change and from which proposal. */
export type ChangeOpts = { proposerType?: ProposerType; proposalId?: string | null }

export type ThreadInput = {
  workId: string
  title: string
  description?: string
  status: 'planned' | 'planted'
  plantedChapterId?: string | null
  targetChapterPosition?: number | null
  importance?: Importance
  relatedEntryIds?: string[]
}

export type ThreadView = ThreadRow & {
  plantedPosition: number | null
  resolvedPosition: number | null
  relatedEntries: { id: string; name: string }[]
  eventCount: number
  overdue: boolean
  latestPosition: number
}

export type ThreadDetail = ThreadView & {
  events: (ThreadEventRow & { chapterPosition: number | null; chapterTitle: string | null })[]
}

export type ThreadEventInput = {
  threadId: string
  kind: ThreadEventKind
  chapterId?: string | null
  note?: string
  evidence?: string
}

export type ThreadPatch = {
  title?: string
  description?: string
  targetChapterPosition?: number | null
  importance?: Importance
  relatedEntryIds?: string[]
}

const IMPORTANCE_RANK: Record<Importance, number> = { high: 0, medium: 1, low: 2 }
const NOT_FOUND_MESSAGE = '항목을 찾을 수 없습니다.'

function requireTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) throw new AppError('VALIDATION', '떡밥 제목을 입력하세요.')
  return trimmed
}

/** Position of a chapter that belongs to the work. Other works' chapters get NOT_FOUND. */
async function chapterPositionInWork(db: Db, workId: string, chapterId: string): Promise<number> {
  const [row] = await db
    .select({ position: chapters.position })
    .from(chapters)
    .where(and(eq(chapters.id, chapterId), eq(chapters.workId, workId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
  return row.position
}

/** Confirms every entry belongs to the work and is active. Returns the deduplicated ids. */
async function requireActiveEntriesInWork(
  db: Db,
  workId: string,
  entryIds: string[],
): Promise<string[]> {
  const unique = [...new Set(entryIds)]
  if (unique.length === 0) return []
  const rows = await db
    .select({ id: wikiEntries.id, archivedAt: wikiEntries.archivedAt })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), inArray(wikiEntries.id, unique)))
  const active = new Set(rows.filter((r) => !r.archivedAt).map((r) => r.id))
  if (unique.some((id) => !active.has(id))) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
  return unique
}

function isOverdue(row: ThreadRow, latestPosition: number): boolean {
  const open = row.status === 'planted' || row.status === 'developing'
  return open && row.targetChapterPosition !== null && latestPosition > row.targetChapterPosition
}

/** Builds views for many threads with a fixed number of queries. */
async function buildViews(db: Db, workId: string, rows: ThreadRow[]): Promise<ThreadView[]> {
  if (rows.length === 0) return []
  const chapterRows = await db
    .select({
      id: chapters.id,
      position: chapters.position,
      archivedAt: chapters.archivedAt,
    })
    .from(chapters)
    .where(eq(chapters.workId, workId))
  const positionById = new Map(chapterRows.map((c) => [c.id, c.position]))
  const latestPosition = chapterRows
    .filter((c) => !c.archivedAt)
    .reduce((max, c) => Math.max(max, c.position), 0)

  const threadIds = rows.map((r) => r.id)
  const links = await db
    .select({ threadId: threadEntries.threadId, id: wikiEntries.id, name: wikiEntries.name })
    .from(threadEntries)
    .innerJoin(wikiEntries, eq(wikiEntries.id, threadEntries.entryId))
    .where(and(inArray(threadEntries.threadId, threadIds), isNull(wikiEntries.archivedAt)))

  const counts = await db
    .select({
      threadId: threadEvents.threadId,
      count: sql<number>`count(*)::int`,
    })
    .from(threadEvents)
    .where(and(inArray(threadEvents.threadId, threadIds), isNull(threadEvents.archivedAt)))
    .groupBy(threadEvents.threadId)
  const countById = new Map(counts.map((c) => [c.threadId, Number(c.count)]))

  return rows.map((row) => ({
    ...row,
    plantedPosition: row.plantedChapterId ? (positionById.get(row.plantedChapterId) ?? null) : null,
    resolvedPosition: row.resolvedChapterId
      ? (positionById.get(row.resolvedChapterId) ?? null)
      : null,
    relatedEntries: links
      .filter((l) => l.threadId === row.id)
      .map((l) => ({ id: l.id, name: l.name })),
    eventCount: countById.get(row.id) ?? 0,
    overdue: isOverdue(row, latestPosition),
    latestPosition,
  }))
}

/** Threads of a work: importance high to low, then planted chapter ascending (unplanted last). */
export async function listThreads(
  db: Db,
  actor: Actor,
  workId: string,
  o?: { statuses?: ThreadStatus[]; includeArchived?: boolean },
): Promise<ThreadView[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions = [eq(threads.workId, workId)]
  if (!o?.includeArchived) conditions.push(isNull(threads.archivedAt))
  if (o?.statuses && o.statuses.length > 0) {
    conditions.push(inArray(threads.status, o.statuses))
  }
  const rows = await db
    .select()
    .from(threads)
    .where(and(...conditions))
  const views = await buildViews(db, workId, rows)
  return views.sort((a, b) => {
    const byImportance = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]
    if (byImportance !== 0) return byImportance
    const pa = a.plantedPosition ?? Number.POSITIVE_INFINITY
    const pb = b.plantedPosition ?? Number.POSITIVE_INFINITY
    return pa - pb
  })
}

/** One thread with its full timeline (events ordered by chapter, then creation time). Viewer role. */
export async function getThread(db: Db, actor: Actor, threadId: string): Promise<ThreadDetail> {
  const workId = await requireRowWork(db, 'threads', threadId)
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
  const [view] = await buildViews(db, workId, [row])

  const events = await db
    .select({
      event: threadEvents,
      chapterPosition: chapters.position,
      chapterTitle: chapters.title,
    })
    .from(threadEvents)
    .leftJoin(chapters, eq(chapters.id, threadEvents.chapterId))
    .where(and(eq(threadEvents.threadId, threadId), isNull(threadEvents.archivedAt)))
  events.sort((a, b) => {
    const pa = a.chapterPosition ?? Number.POSITIVE_INFINITY
    const pb = b.chapterPosition ?? Number.POSITIVE_INFINITY
    if (pa !== pb) return pa - pb
    return a.event.createdAt.getTime() - b.event.createdAt.getTime()
  })

  return {
    ...view,
    events: events.map((e) => ({
      ...e.event,
      chapterPosition: e.chapterPosition ?? null,
      chapterTitle: e.chapterTitle ?? null,
    })),
  }
}

/**
 * Creates a thread. A `planted` thread needs its planted chapter and also gets a `planted`
 * event, so the timeline starts with the planting.
 */
export async function createThread(
  db: Db,
  actor: Actor,
  input: ThreadInput,
  o?: ChangeOpts,
): Promise<ThreadRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const title = requireTitle(input.title)
  if (input.status === 'planted' && !input.plantedChapterId) {
    throw new AppError('VALIDATION', '심은 회차를 선택하세요.')
  }
  const proposerType = o?.proposerType ?? 'author'
  const proposalId = o?.proposalId ?? null
  const plantedChapterId = input.status === 'planted' ? (input.plantedChapterId ?? null) : null
  if (plantedChapterId) await chapterPositionInWork(db, input.workId, plantedChapterId)
  const entryIds = await requireActiveEntriesInWork(db, input.workId, input.relatedEntryIds ?? [])

  return db.transaction(async (tx) => {
    const [thread] = await tx
      .insert(threads)
      .values({
        workId: input.workId,
        title,
        description: input.description?.trim() ?? '',
        status: input.status,
        plantedChapterId,
        targetChapterPosition: input.targetChapterPosition ?? null,
        importance: input.importance ?? 'medium',
        createdByType: proposerType,
      })
      .returning()
    if (entryIds.length > 0) {
      await tx
        .insert(threadEntries)
        .values(entryIds.map((entryId) => ({ threadId: thread.id, entryId })))
    }
    await recordChange(tx, {
      workId: input.workId,
      targetTable: 'threads',
      targetId: thread.id,
      action: 'create',
      before: null,
      after: await threadSnapshot(tx, thread.id),
      proposerType,
      actorId: actor.userId,
      proposalId,
      summary: `떡밥 '${title}' 추가`,
    })

    if (plantedChapterId) {
      const [event] = await tx
        .insert(threadEvents)
        .values({
          threadId: thread.id,
          kind: 'planted',
          chapterId: plantedChapterId,
          note: '',
          evidence: '',
          createdByType: proposerType,
        })
        .returning()
      await recordChange(tx, {
        workId: input.workId,
        targetTable: 'thread_events',
        targetId: event.id,
        action: 'create',
        before: null,
        after: event,
        proposerType,
        actorId: actor.userId,
        proposalId,
        summary: `떡밥 '${title}' ${THREAD_EVENT_LABEL.planted} 기록`,
      })
    }
    return thread
  })
}

/** Author edit of a thread's details. Status changes go through addThreadEvent. */
export async function updateThread(
  db: Db,
  actor: Actor,
  threadId: string,
  patch: ThreadPatch,
  o?: ChangeOpts,
): Promise<ThreadRow> {
  const workId = await requireRowWork(db, 'threads', threadId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const entryIds =
    patch.relatedEntryIds !== undefined
      ? await requireActiveEntriesInWork(db, workId, patch.relatedEntryIds)
      : undefined

  return db.transaction(async (tx) => {
    const before = await threadSnapshot(tx, threadId)
    if (before.archivedAt) throw new AppError('BAD_STATE', '보관된 떡밥입니다.')

    const values: Partial<typeof threads.$inferInsert> = { updatedAt: new Date() }
    if (patch.title !== undefined) values.title = requireTitle(patch.title)
    if (patch.description !== undefined) values.description = patch.description.trim()
    if (patch.targetChapterPosition !== undefined) {
      values.targetChapterPosition = patch.targetChapterPosition
    }
    if (patch.importance !== undefined) values.importance = patch.importance
    const [updated] = await tx
      .update(threads)
      .set(values)
      .where(eq(threads.id, threadId))
      .returning()

    if (entryIds !== undefined) {
      await tx.delete(threadEntries).where(eq(threadEntries.threadId, threadId))
      if (entryIds.length > 0) {
        await tx.insert(threadEntries).values(entryIds.map((entryId) => ({ threadId, entryId })))
      }
    }
    await recordChange(tx, {
      workId,
      targetTable: 'threads',
      targetId: threadId,
      action: 'update',
      before,
      after: await threadSnapshot(tx, threadId),
      proposerType: o?.proposerType ?? 'author',
      actorId: actor.userId,
      proposalId: o?.proposalId ?? null,
      summary: `떡밥 '${updated.title}' 수정`,
    })
    return updated
  })
}

/**
 * Appends a timeline event and moves the thread status. Ordering rules (spec 4.2):
 * developed is at or after the planted chapter, resolved is strictly after it.
 * A note never changes status and is allowed on any thread.
 */
export async function addThreadEvent(
  db: Db,
  actor: Actor,
  input: ThreadEventInput,
  o?: ChangeOpts,
): Promise<ThreadEventRow> {
  const workId = await requireRowWork(db, 'threads', input.threadId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const proposerType = o?.proposerType ?? 'author'
  const kind = input.kind

  return db.transaction(async (tx) => {
    const before = await threadSnapshot(tx, input.threadId)
    if (before.archivedAt) throw new AppError('BAD_STATE', '보관된 떡밥입니다.')
    if (kind !== 'note' && (before.status === 'resolved' || before.status === 'discarded')) {
      throw new AppError('BAD_STATE', '이미 회수되었거나 폐기된 떡밥입니다.')
    }
    if (kind === 'planted' && before.plantedChapterId) {
      throw new AppError('BAD_STATE', '이미 심은 떡밥입니다.')
    }

    const plantedPosition = before.plantedChapterId
      ? await chapterPositionInWork(tx, workId, before.plantedChapterId)
      : null
    if ((kind === 'developed' || kind === 'resolved') && plantedPosition === null) {
      throw new AppError('VALIDATION', '아직 심지 않은 떡밥입니다. 먼저 심은 회차를 기록하세요.')
    }
    const needsChapter = kind === 'planted' || kind === 'developed' || kind === 'resolved'
    if (needsChapter && !input.chapterId) throw new AppError('VALIDATION', '회차를 선택하세요.')
    const chapterId = input.chapterId ?? null
    const position = chapterId ? await chapterPositionInWork(tx, workId, chapterId) : null

    if (kind === 'developed' && plantedPosition !== null && position !== null) {
      if (position < plantedPosition) {
        throw new AppError(
          'VALIDATION',
          `발전 기록은 떡밥을 심은 회차(${plantedPosition}화) 이후여야 합니다.`,
        )
      }
    }
    if (kind === 'resolved' && plantedPosition !== null && position !== null) {
      if (position <= plantedPosition) {
        throw new AppError(
          'VALIDATION',
          `회수는 떡밥을 심은 회차(${plantedPosition}화) 이후에만 기록할 수 있습니다.`,
        )
      }
    }

    const now = new Date()
    const [event] = await tx
      .insert(threadEvents)
      .values({
        threadId: input.threadId,
        kind,
        chapterId,
        note: input.note?.trim() ?? '',
        evidence: input.evidence?.trim() ?? '',
        createdByType: proposerType,
      })
      .returning()
    await recordChange(tx, {
      workId,
      targetTable: 'thread_events',
      targetId: event.id,
      action: 'create',
      before: null,
      after: event,
      proposerType,
      actorId: actor.userId,
      proposalId: o?.proposalId ?? null,
      summary: `떡밥 '${before.title}' ${THREAD_EVENT_LABEL[kind]} 기록`,
    })

    const statusPatch = threadStatusPatch(kind, chapterId)
    const [updated] = await tx
      .update(threads)
      .set({ ...statusPatch, updatedAt: now })
      .where(eq(threads.id, input.threadId))
      .returning()
    await recordChange(tx, {
      workId,
      targetTable: 'threads',
      targetId: input.threadId,
      action: 'update',
      before,
      after: await threadSnapshot(tx, input.threadId),
      proposerType,
      actorId: actor.userId,
      proposalId: o?.proposalId ?? null,
      summary: `떡밥 '${updated.title}' 상태: ${THREAD_STATUS_LABEL[updated.status]}`,
    })
    return event
  })
}

function threadStatusPatch(
  kind: ThreadEventKind,
  chapterId: string | null,
): Partial<typeof threads.$inferInsert> {
  switch (kind) {
    case 'planted':
      return { status: 'planted', plantedChapterId: chapterId }
    case 'developed':
      return { status: 'developing' }
    case 'resolved':
      return { status: 'resolved', resolvedChapterId: chapterId }
    case 'discarded':
      return { status: 'discarded' }
    case 'note':
      return {}
  }
}

/** Archives a thread (never deleted). Its timeline stays and it leaves the default list. */
export async function archiveThread(
  db: Db,
  actor: Actor,
  threadId: string,
  o?: ChangeOpts,
): Promise<ThreadRow> {
  const workId = await requireRowWork(db, 'threads', threadId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  return db.transaction(async (tx) => {
    const before = await threadSnapshot(tx, threadId)
    if (before.archivedAt) throw new AppError('BAD_STATE', '이미 보관된 떡밥입니다.')
    const now = new Date()
    const [updated] = await tx
      .update(threads)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(threads.id, threadId))
      .returning()
    await recordChange(tx, {
      workId,
      targetTable: 'threads',
      targetId: threadId,
      action: 'archive',
      before,
      after: await threadSnapshot(tx, threadId),
      proposerType: o?.proposerType ?? 'author',
      actorId: actor.userId,
      proposalId: o?.proposalId ?? null,
      summary: `떡밥 '${updated.title}' 보관`,
    })
    return updated
  })
}

/**
 * Archives one timeline event. The thread's status and planted/resolved chapters are then
 * re-derived from the remaining events, and that change is logged with this one.
 */
export async function archiveThreadEvent(
  db: Db,
  actor: Actor,
  eventId: string,
  o?: ChangeOpts,
): Promise<ThreadEventRow> {
  const workId = await requireRowWork(db, 'thread_events', eventId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(threadEvents)
      .where(eq(threadEvents.id, eventId))
      .limit(1)
    if (!before) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
    if (before.archivedAt) throw new AppError('BAD_STATE', '이미 보관된 기록입니다.')
    const [updated] = await tx
      .update(threadEvents)
      .set({ archivedAt: new Date() })
      .where(eq(threadEvents.id, eventId))
      .returning()
    await recordChange(tx, {
      workId,
      targetTable: 'thread_events',
      targetId: eventId,
      action: 'archive',
      before,
      after: updated,
      proposerType: o?.proposerType ?? 'author',
      actorId: actor.userId,
      proposalId: o?.proposalId ?? null,
      summary: `떡밥 기록 '${THREAD_EVENT_LABEL[before.kind]}' 보관`,
    })
    await syncThreadFromEvents(tx, actor, workId, before.threadId, {
      proposerType: o?.proposerType,
      proposalId: o?.proposalId,
    })
    return updated
  })
}
