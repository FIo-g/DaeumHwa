import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  authorDirectives,
  changeLog,
  chapters,
  facts,
  namingRules,
  relations,
  styleCards,
  threadEntries,
  threadEvents,
  threads,
  user,
  wikiEntries,
} from '@/db/schema'
import type {
  Actor,
  ChangeAction,
  ChangeRow,
  ChangeTargetTable,
  FactRow,
  ProposerType,
  ThreadEventKind,
  ThreadStatus,
} from '@/db/types'
import { AppError } from '@/lib/errors'
import { THREAD_STATUS_LABEL } from '@/lib/labels'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { recomputeAppearancesForEntry } from '@/server/appearances'
import { assertEntryNameFree, relinkFactsForEntry } from '@/server/entry-integrity'

export type RecordChangeInput = {
  workId: string
  targetTable: ChangeTargetTable
  targetId: string
  action: ChangeAction
  before: unknown | null
  after: unknown | null
  proposerType: ProposerType
  actorId: string | null
  proposalId?: string | null
  revertsChangeId?: string | null
  summary: string
}

/**
 * Appends one change_log row. Pass the transaction as `db` when the change belongs to a
 * larger write, so the history row commits with the change itself.
 * `before`/`after` are row snapshots (the fields a revert needs to restore).
 */
export async function recordChange(db: Db, input: RecordChangeInput): Promise<ChangeRow> {
  const [row] = await db
    .insert(changeLog)
    .values({
      workId: input.workId,
      targetTable: input.targetTable,
      targetId: input.targetId,
      action: input.action,
      before: input.before ?? null,
      after: input.after ?? null,
      proposerType: input.proposerType,
      actorId: input.actorId,
      proposalId: input.proposalId ?? null,
      revertsChangeId: input.revertsChangeId ?? null,
      summary: input.summary,
      // clock_timestamp() instead of now(): changes made in one transaction must stay ordered.
      // The clock can tie (PGlite reports milliseconds), so each change also lands at least one
      // microsecond after the work's latest change. Ties would fall back to the random id order.
      createdAt: sql`greatest(clock_timestamp(), (select max(cl.created_at) from change_log cl where cl.work_id = ${input.workId}) + interval '1 microsecond')`,
    })
    .returning()
  return row
}

/** Short one-line text for change summaries. */
export function preview(text: string, max = 40): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine
}

/** Who a derived change is attributed to. Reverts and archives default to the author. */
export type HistoryOpts = { proposerType?: ProposerType; proposalId?: string | null }

export type ChangeFilter = {
  targetTable?: ChangeTargetTable
  targetId?: string
  proposerType?: ProposerType
  limit?: number
  /**
   * Keyset cursor: the id of the last row of the previous page. Rows are compared on
   * (created_at, id) inside the database, so microsecond timestamps and ties are exact.
   */
  beforeId?: string
}

export type ChangeView = ChangeRow & {
  actorName: string | null
  /** True when no later change exists for the same target, so revertChange accepts it. */
  revertable: boolean
}

/** Change history of a work, newest first. Viewer role or higher. */
export async function listChanges(
  db: Db,
  actor: Actor,
  workId: string,
  f: ChangeFilter = {},
): Promise<ChangeView[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions = [eq(changeLog.workId, workId)]
  if (f.targetTable) conditions.push(eq(changeLog.targetTable, f.targetTable))
  if (f.targetId) conditions.push(eq(changeLog.targetId, f.targetId))
  if (f.proposerType) conditions.push(eq(changeLog.proposerType, f.proposerType))
  if (f.beforeId) {
    // The subselect is scoped to this work, so a foreign id yields no cursor and an empty page.
    conditions.push(
      sql`(${changeLog.createdAt}, ${changeLog.id}) < (select created_at, id from change_log where id = ${f.beforeId} and work_id = ${workId})`,
    )
  }
  const later = sql`exists (select 1 from change_log later where later.work_id = ${changeLog.workId} and later.target_table = ${changeLog.targetTable} and later.target_id = ${changeLog.targetId} and (later.created_at, later.id) > (${changeLog.createdAt}, ${changeLog.id}))`
  const rows = await db
    .select({
      change: changeLog,
      actorName: user.name,
      hasLater: sql<boolean>`${later}`.mapWith(Boolean),
    })
    .from(changeLog)
    .leftJoin(user, eq(user.id, changeLog.actorId))
    .where(and(...conditions))
    .orderBy(desc(changeLog.createdAt), desc(changeLog.id))
    .limit(f.limit ?? 50)
  return rows.map((r) => ({
    ...r.change,
    actorName: r.actorName ?? null,
    revertable: !r.hasLater,
  }))
}

// ---- Revert ----

type Snapshot = Record<string, unknown>

// Mutable columns per table (TS property names). A revert writes back only these keys.
const WIKI_ENTRY_KEYS = [
  'kind',
  'name',
  'aliases',
  'summary',
  'body',
  'fields',
  'customFields',
  'archivedAt',
] as const
const FACT_KEYS = [
  'entryId',
  'subjectName',
  'content',
  'status',
  'sourceType',
  'sourceChapterId',
  'evidence',
  'validFromPosition',
  'validToPosition',
  'supersededByFactId',
  'archivedAt',
] as const
const THREAD_KEYS = [
  'title',
  'description',
  'status',
  'plantedChapterId',
  'resolvedChapterId',
  'targetChapterPosition',
  'importance',
  'archivedAt',
] as const
const THREAD_EVENT_KEYS = ['kind', 'chapterId', 'note', 'evidence', 'archivedAt'] as const
const RELATION_KEYS = [
  'kind',
  'description',
  'directed',
  'startPosition',
  'endPosition',
  'sourceEntryId',
  'targetEntryId',
  'archivedAt',
] as const
const NAMING_RULE_KEYS = ['canonical', 'variants', 'note', 'entryId', 'archivedAt'] as const
const STYLE_CARD_KEYS = ['entryId', 'name', 'tone', 'rules', 'examples', 'archivedAt'] as const
const AUTHOR_DIRECTIVE_KEYS = [
  'entryId',
  'scope',
  'kind',
  'text',
  'pattern',
  'speechLevel',
  'targetChars',
  'chapterPosition',
  'status',
  'archivedAt',
] as const
const CHAPTER_KEYS = ['summary'] as const

/** Keeps the listed keys that are present in the snapshot. JSON strings for archivedAt become Dates. */
function pick<T extends object>(snap: Snapshot, keys: readonly (keyof T & string)[]): Partial<T> {
  const out: Snapshot = {}
  for (const key of keys) {
    if (!(key in snap)) continue
    const value = snap[key]
    out[key] = key === 'archivedAt' && typeof value === 'string' ? new Date(value) : value
  }
  return out as Partial<T>
}

/** Entry ids linked to a thread (the thread's related cards). */
async function linkedEntryIds(db: Db, threadId: string): Promise<string[]> {
  const links = await db
    .select({ entryId: threadEntries.entryId })
    .from(threadEntries)
    .where(eq(threadEntries.threadId, threadId))
  return links.map((l) => l.entryId)
}

/**
 * Thread row plus its entry links: the snapshot shape of every thread change, including the
 * revert rows, so that reverting a revert restores the links too.
 */
export async function threadSnapshot(db: Db, threadId: string) {
  const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return { ...row, relatedEntryIds: await linkedEntryIds(db, threadId) }
}

/** Current state of the row a change points at, or null when it no longer exists. */
async function readRow(db: Db, table: ChangeTargetTable, id: string): Promise<Snapshot | null> {
  switch (table) {
    case 'wiki_entries':
      return (await db.select().from(wikiEntries).where(eq(wikiEntries.id, id)).limit(1))[0] ?? null
    case 'facts':
      return (await db.select().from(facts).where(eq(facts.id, id)).limit(1))[0] ?? null
    case 'threads': {
      const [row] = await db.select().from(threads).where(eq(threads.id, id)).limit(1)
      if (!row) return null
      return { ...row, relatedEntryIds: await linkedEntryIds(db, id) }
    }
    case 'thread_events':
      return (
        (await db.select().from(threadEvents).where(eq(threadEvents.id, id)).limit(1))[0] ?? null
      )
    case 'relations':
      return (await db.select().from(relations).where(eq(relations.id, id)).limit(1))[0] ?? null
    case 'naming_rules':
      return (await db.select().from(namingRules).where(eq(namingRules.id, id)).limit(1))[0] ?? null
    case 'style_cards':
      return (await db.select().from(styleCards).where(eq(styleCards.id, id)).limit(1))[0] ?? null
    case 'author_directives':
      return (
        (await db.select().from(authorDirectives).where(eq(authorDirectives.id, id)).limit(1))[0] ??
        null
      )
    case 'chapters':
      return (await db.select().from(chapters).where(eq(chapters.id, id)).limit(1))[0] ?? null
  }
}

/** Writes the snapshot's mutable columns back onto the row. Threads also restore their entry links. */
async function writeRow(
  db: Db,
  table: ChangeTargetTable,
  id: string,
  snap: Snapshot,
  now: Date,
): Promise<void> {
  switch (table) {
    case 'wiki_entries':
      await db
        .update(wikiEntries)
        .set({ ...pick<typeof wikiEntries.$inferInsert>(snap, WIKI_ENTRY_KEYS), updatedAt: now })
        .where(eq(wikiEntries.id, id))
      return
    case 'facts':
      await db
        .update(facts)
        .set({ ...pick<typeof facts.$inferInsert>(snap, FACT_KEYS), updatedAt: now })
        .where(eq(facts.id, id))
      return
    case 'threads':
      await db
        .update(threads)
        .set({ ...pick<typeof threads.$inferInsert>(snap, THREAD_KEYS), updatedAt: now })
        .where(eq(threads.id, id))
      // Snapshots of thread changes carry relatedEntryIds so that entry links come back too.
      if (Array.isArray(snap.relatedEntryIds)) {
        await db.delete(threadEntries).where(eq(threadEntries.threadId, id))
        const entryIds = snap.relatedEntryIds as string[]
        if (entryIds.length > 0) {
          await db
            .insert(threadEntries)
            .values(entryIds.map((entryId) => ({ threadId: id, entryId })))
        }
      }
      return
    case 'thread_events':
      await db
        .update(threadEvents)
        .set(pick<typeof threadEvents.$inferInsert>(snap, THREAD_EVENT_KEYS))
        .where(eq(threadEvents.id, id))
      return
    case 'relations':
      await db
        .update(relations)
        .set({ ...pick<typeof relations.$inferInsert>(snap, RELATION_KEYS), updatedAt: now })
        .where(eq(relations.id, id))
      return
    case 'naming_rules':
      await db
        .update(namingRules)
        .set({ ...pick<typeof namingRules.$inferInsert>(snap, NAMING_RULE_KEYS), updatedAt: now })
        .where(eq(namingRules.id, id))
      return
    case 'style_cards':
      await db
        .update(styleCards)
        .set({ ...pick<typeof styleCards.$inferInsert>(snap, STYLE_CARD_KEYS), updatedAt: now })
        .where(eq(styleCards.id, id))
      return
    case 'author_directives':
      await db
        .update(authorDirectives)
        .set({
          ...pick<typeof authorDirectives.$inferInsert>(snap, AUTHOR_DIRECTIVE_KEYS),
          updatedAt: now,
        })
        .where(eq(authorDirectives.id, id))
      return
    case 'chapters':
      await db
        .update(chapters)
        .set({ ...pick<typeof chapters.$inferInsert>(snap, CHAPTER_KEYS), updatedAt: now })
        .where(eq(chapters.id, id))
      return
  }
}

/** Tables whose rows are archived (never hard-deleted). Chapters are not archived by changes. */
function isArchivable(table: ChangeTargetTable): boolean {
  return table !== 'chapters'
}

/** Thread status a timeline event sets. A note sets none. */
const EVENT_STATUS: Record<ThreadEventKind, ThreadStatus | null> = {
  planted: 'planted',
  developed: 'developing',
  resolved: 'resolved',
  discarded: 'discarded',
  note: null,
}

function last<T>(items: T[]): T | undefined {
  return items[items.length - 1]
}

/**
 * Re-derives a thread's status and planted/resolved chapters from its active timeline events,
 * and logs an 'update' change when they differ. Call it after a timeline event is archived or
 * restored, so a thread never shows 'resolved' without an active resolving event.
 * Notes never change status, so archiving one writes nothing.
 */
export async function syncThreadFromEvents(
  db: Db,
  actor: Actor,
  workId: string,
  threadId: string,
  o: HistoryOpts = {},
): Promise<void> {
  const before = await threadSnapshot(db, threadId)
  if (before.archivedAt) return
  const events = await db
    .select()
    .from(threadEvents)
    .where(and(eq(threadEvents.threadId, threadId), isNull(threadEvents.archivedAt)))
    .orderBy(asc(threadEvents.createdAt), asc(threadEvents.id))

  const lastRecord = last(events.filter((e) => e.kind !== 'note'))
  let status: ThreadStatus = (lastRecord && EVENT_STATUS[lastRecord.kind]) || 'planned'
  const planted = last(events.filter((e) => e.kind === 'planted'))
  // Developed and resolved threads always have a planted chapter, so without one they are only planned.
  if (!planted && (status === 'developing' || status === 'resolved')) status = 'planned'
  const plantedChapterId = planted?.chapterId ?? null
  const resolved = last(events.filter((e) => e.kind === 'resolved'))
  const resolvedChapterId = status === 'resolved' ? (resolved?.chapterId ?? null) : null

  if (
    before.status === status &&
    before.plantedChapterId === plantedChapterId &&
    before.resolvedChapterId === resolvedChapterId
  ) {
    return
  }
  await db
    .update(threads)
    .set({ status, plantedChapterId, resolvedChapterId, updatedAt: new Date() })
    .where(eq(threads.id, threadId))
  await recordChange(db, {
    workId,
    targetTable: 'threads',
    targetId: threadId,
    action: 'update',
    before,
    after: await threadSnapshot(db, threadId),
    proposerType: o.proposerType ?? 'author',
    actorId: actor.userId,
    proposalId: o.proposalId ?? null,
    summary: `떡밥 '${before.title}' 상태: ${THREAD_STATUS_LABEL[status]}`,
  })
}

/** The earlier fact a replacing fact pushed out, as it was before (kept on the change's `before`). */
export type PredecessorLink = {
  id: string
  validToPosition: number | null
  supersededByFactId: string | null
}

/**
 * Archiving a fact that replaced an earlier one would leave the earlier fact ended and pointing
 * at an archived fact. This points that earlier fact at the fact's own successor, or reopens it
 * when there is none, and records an 'update' on it. Returns its link as it was, or null when
 * no earlier fact pointed at `fact`.
 */
export async function detachFromPredecessor(
  db: Db,
  workId: string,
  actorId: string,
  fact: Pick<FactRow, 'id' | 'supersededByFactId' | 'validToPosition'>,
  o: HistoryOpts = {},
): Promise<PredecessorLink | null> {
  const [pred] = await db
    .select()
    .from(facts)
    .where(and(eq(facts.supersededByFactId, fact.id), isNull(facts.archivedAt)))
    .limit(1)
  if (!pred) return null
  const [updated] = await db
    .update(facts)
    .set({
      supersededByFactId: fact.supersededByFactId,
      validToPosition: fact.validToPosition,
      updatedAt: new Date(),
    })
    .where(eq(facts.id, pred.id))
    .returning()
  await recordChange(db, {
    workId,
    targetTable: 'facts',
    targetId: pred.id,
    action: 'update',
    before: pred,
    after: updated,
    proposerType: o.proposerType ?? 'author',
    actorId,
    proposalId: o.proposalId ?? null,
    summary: `사실 바뀜 취소: ${preview(pred.content)}`,
  })
  return {
    id: pred.id,
    validToPosition: pred.validToPosition,
    supersededByFactId: pred.supersededByFactId,
  }
}

/**
 * Undoes detachFromPredecessor when the replacing fact comes back. The earlier fact is re-linked
 * unless something else has replaced it since.
 */
export async function reattachPredecessor(
  db: Db,
  workId: string,
  actorId: string,
  link: PredecessorLink | null,
  o: HistoryOpts = {},
): Promise<void> {
  if (!link) return
  const [pred] = await db.select().from(facts).where(eq(facts.id, link.id)).limit(1)
  if (!pred || pred.archivedAt || pred.supersededByFactId) return
  const [updated] = await db
    .update(facts)
    .set({
      supersededByFactId: link.supersededByFactId,
      validToPosition: link.validToPosition,
      updatedAt: new Date(),
    })
    .where(eq(facts.id, pred.id))
    .returning()
  await recordChange(db, {
    workId,
    targetTable: 'facts',
    targetId: pred.id,
    action: 'update',
    before: pred,
    after: updated,
    proposerType: o.proposerType ?? 'author',
    actorId,
    proposalId: o.proposalId ?? null,
    summary: `사실 바뀜 복원: ${preview(pred.content)}`,
  })
}

/** The predecessor link stored on an archive change's `before` (or a revert row's `before`). */
function reopenedPredecessorOf(snap: Snapshot): PredecessorLink | null {
  const link = snap.reopenedPredecessor as PredecessorLink | undefined
  return link && typeof link.id === 'string' ? link : null
}

/**
 * Reverting a supersede's 'before' would un-end a fact whose replacement is still live.
 * Reverting the replacement itself (its archive) is the way out, so refuse here.
 */
async function assertCanUnsupersede(db: Db, target: Snapshot, current: Snapshot): Promise<void> {
  const successorId = current.supersededByFactId
  if (target.supersededByFactId || typeof successorId !== 'string') return
  const [successor] = await db
    .select({ archivedAt: facts.archivedAt })
    .from(facts)
    .where(eq(facts.id, successorId))
    .limit(1)
  if (successor && !successor.archivedAt) {
    throw new AppError(
      'CONFLICT',
      '이 사실을 대체한 새 사실이 있어 먼저 새 사실의 추가를 되돌려야 합니다.',
    )
  }
}

/**
 * Brings wiki data that depends on an entry's names and archived state back in line with the row:
 * appearances always, fact links when active. An active result must not collide with another card.
 */
async function rebuildEntryDerived(
  db: Db,
  workId: string,
  entryId: string,
  before: { archived: boolean; name: string; kind: string },
): Promise<void> {
  const [entry] = await db.select().from(wikiEntries).where(eq(wikiEntries.id, entryId)).limit(1)
  if (!entry.archivedAt) {
    const renamed = before.name !== entry.name || before.kind !== entry.kind
    if (before.archived || renamed) {
      await assertEntryNameFree(db, workId, entry.kind, entry.name, entry.id)
    }
    await relinkFactsForEntry(db, entry)
  }
  await recomputeAppearancesForEntry(db, entryId)
}

/**
 * Derived data that follows a reverted row, written in the same transaction. Returns the
 * predecessor link that a fact archive detached, so the revert row can carry it for a later undo.
 */
async function applyDerivedChanges(
  db: Db,
  actor: Actor,
  workId: string,
  table: ChangeTargetTable,
  id: string,
  current: Snapshot,
  target: Snapshot,
): Promise<PredecessorLink | null> {
  switch (table) {
    case 'wiki_entries':
      await rebuildEntryDerived(db, workId, id, {
        archived: current.archivedAt != null,
        name: String(current.name),
        kind: String(current.kind),
      })
      return null
    case 'thread_events':
      await syncThreadFromEvents(db, actor, workId, String(current.threadId), {})
      return null
    case 'facts': {
      const [fact] = await db.select().from(facts).where(eq(facts.id, id)).limit(1)
      const wasArchived = current.archivedAt != null
      if (!wasArchived && fact.archivedAt) {
        return detachFromPredecessor(db, workId, actor.userId, fact)
      }
      if (wasArchived && !fact.archivedAt) {
        await reattachPredecessor(db, workId, actor.userId, reopenedPredecessorOf(target))
      }
      return null
    }
    default:
      return null
  }
}

/**
 * Reverts the most recent change of one row (spec F5). Create -> archive the row,
 * update -> restore `before`, archive/restore -> the opposite. Writes a new 'revert' change.
 * Derived data follows in the same transaction: entry appearances and fact links for wiki
 * entries, the replaced-fact chain for facts, and the thread status for timeline events.
 */
export async function revertChange(db: Db, actor: Actor, changeId: string): Promise<ChangeRow> {
  const workId = await requireRowWork(db, 'change_log', changeId)
  await requireWorkRole(db, workId, actor.userId, 'editor')

  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(changeLog).where(eq(changeLog.id, changeId)).limit(1)
    if (!original) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')

    const [latest] = await tx
      .select({ id: changeLog.id })
      .from(changeLog)
      .where(
        and(
          eq(changeLog.workId, workId),
          eq(changeLog.targetTable, original.targetTable),
          eq(changeLog.targetId, original.targetId),
        ),
      )
      // Same (created_at, id) order as listChanges, so both agree on the newest change.
      .orderBy(desc(changeLog.createdAt), desc(changeLog.id))
      .limit(1)
    if (latest?.id !== original.id) {
      throw new AppError('CONFLICT', '이후 변경이 있어 먼저 그 변경을 되돌려야 합니다.')
    }

    const current = await readRow(tx, original.targetTable, original.targetId)
    if (!current) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')

    const now = new Date()
    const hasBefore = original.before !== null && original.before !== undefined
    if (!hasBefore && !isArchivable(original.targetTable)) {
      throw new AppError('BAD_STATE', '되돌릴 수 없는 변경입니다.')
    }
    // A create has no `before`: reverting it archives the row instead.
    const target = hasBefore ? (original.before as Snapshot) : { archivedAt: now }
    if (hasBefore && original.targetTable === 'facts') {
      await assertCanUnsupersede(tx, target, current)
    }
    await writeRow(tx, original.targetTable, original.targetId, target, now)
    const next = await readRow(tx, original.targetTable, original.targetId)

    const predecessor = await applyDerivedChanges(
      tx,
      actor,
      workId,
      original.targetTable,
      original.targetId,
      current,
      target,
    )

    const [change] = await tx
      .insert(changeLog)
      .values({
        workId,
        targetTable: original.targetTable,
        targetId: original.targetId,
        action: 'revert',
        before: predecessor ? { ...current, reopenedPredecessor: predecessor } : current,
        after: next,
        proposerType: 'author',
        actorId: actor.userId,
        revertsChangeId: original.id,
        summary: `되돌리기: ${original.summary}`,
        createdAt: sql`clock_timestamp()`,
      })
      .returning()
    return change
  })
}
