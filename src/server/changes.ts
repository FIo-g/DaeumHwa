import { and, desc, eq, lt, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
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
import type { Actor, ChangeAction, ChangeRow, ChangeTargetTable, ProposerType } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireRowWork, requireWorkRole } from '@/server/access'

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
      createdAt: sql`clock_timestamp()`,
    })
    .returning()
  return row
}

export type ChangeFilter = {
  targetTable?: ChangeTargetTable
  targetId?: string
  proposerType?: ProposerType
  limit?: number
  beforeCreatedAt?: Date
}

/** Change history of a work, newest first. Viewer role or higher. */
export async function listChanges(
  db: Db,
  actor: Actor,
  workId: string,
  f: ChangeFilter = {},
): Promise<(ChangeRow & { actorName: string | null })[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions = [eq(changeLog.workId, workId)]
  if (f.targetTable) conditions.push(eq(changeLog.targetTable, f.targetTable))
  if (f.targetId) conditions.push(eq(changeLog.targetId, f.targetId))
  if (f.proposerType) conditions.push(eq(changeLog.proposerType, f.proposerType))
  if (f.beforeCreatedAt) conditions.push(lt(changeLog.createdAt, f.beforeCreatedAt))
  const rows = await db
    .select({ change: changeLog, actorName: user.name })
    .from(changeLog)
    .leftJoin(user, eq(user.id, changeLog.actorId))
    .where(and(...conditions))
    .orderBy(desc(changeLog.createdAt))
    .limit(f.limit ?? 50)
  return rows.map((r) => ({ ...r.change, actorName: r.actorName ?? null }))
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

/** Current state of the row a change points at, or null when it no longer exists. */
async function readRow(db: Db, table: ChangeTargetTable, id: string): Promise<Snapshot | null> {
  switch (table) {
    case 'wiki_entries':
      return (await db.select().from(wikiEntries).where(eq(wikiEntries.id, id)).limit(1))[0] ?? null
    case 'facts':
      return (await db.select().from(facts).where(eq(facts.id, id)).limit(1))[0] ?? null
    case 'threads':
      return (await db.select().from(threads).where(eq(threads.id, id)).limit(1))[0] ?? null
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

/**
 * Reverts the most recent change of one row (spec F5). Create -> archive the row,
 * update -> restore `before`, archive/restore -> the opposite. Writes a new 'revert' change.
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
      .orderBy(desc(changeLog.createdAt))
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
    await writeRow(tx, original.targetTable, original.targetId, target, now)
    const next = await readRow(tx, original.targetTable, original.targetId)

    const [change] = await tx
      .insert(changeLog)
      .values({
        workId,
        targetTable: original.targetTable,
        targetId: original.targetId,
        action: 'revert',
        before: current,
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
