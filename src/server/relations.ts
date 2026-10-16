import { alias } from 'drizzle-orm/pg-core'
import { and, asc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, relations, wikiEntries } from '@/db/schema'
import type { Actor, EntryKind, ProposerType, RelationRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { getFirstAppearances } from '@/server/appearances'
import { recordChange } from '@/server/changes'

// Relations are the edges of the relationship graph (F10). Entries must belong to the work
// and be active. Every write records change_log rows in the same transaction.

/** Same shape as ChangeOpts in threads.ts (kept local so the two modules stay independent). */
export type ChangeOpts = { proposerType?: ProposerType; proposalId?: string | null }

export type RelationView = RelationRow & { sourceName: string; targetName: string }

export type RelationInput = {
  workId: string
  sourceEntryId: string
  targetEntryId: string
  kind: string
  description?: string
  directed?: boolean
  startPosition?: number | null
  endPosition?: number | null
}

export type RelationPatch = {
  sourceEntryId?: string
  targetEntryId?: string
  kind?: string
  description?: string
  directed?: boolean
  startPosition?: number | null
  endPosition?: number | null
}

export type GraphData = {
  nodes: { id: string; name: string; kind: EntryKind; firstAppearance: number | null }[]
  edges: {
    id: string
    source: string
    target: string
    kind: string
    description: string
    directed: boolean
    startPosition: number | null
    endPosition: number | null
  }[]
  latestPosition: number
}

const NOT_FOUND_MESSAGE = '항목을 찾을 수 없습니다.'

function requireKind(kind: string): string {
  const trimmed = kind.trim()
  if (!trimmed) throw new AppError('VALIDATION', '관계 종류를 입력하세요.')
  return trimmed
}

/** Pure rules on the final values of a relation: distinct ends, and start not after end. */
function validateShape(
  sourceEntryId: string,
  targetEntryId: string,
  startPosition: number | null,
  endPosition: number | null,
): void {
  if (sourceEntryId === targetEntryId) {
    throw new AppError('VALIDATION', '같은 카드끼리는 연결할 수 없습니다.')
  }
  if (startPosition !== null && endPosition !== null && startPosition > endPosition) {
    throw new AppError('VALIDATION', '시작 회차가 끝 회차보다 늦습니다.')
  }
}

/** Returns the names of the given entries. Entries of another work or archived entries are NOT_FOUND. */
async function requireActiveEntriesInWork(
  db: Db,
  workId: string,
  entryIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(entryIds)]
  const rows = await db
    .select({ id: wikiEntries.id, name: wikiEntries.name, archivedAt: wikiEntries.archivedAt })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), inArray(wikiEntries.id, unique)))
  const active = new Map(rows.filter((r) => !r.archivedAt).map((r) => [r.id, r.name]))
  if (unique.some((id) => !active.has(id))) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
  return active
}

/** Position of the newest non-archived chapter of the work (0 when there is none). */
async function latestChapterPosition(db: Db, workId: string): Promise<number> {
  const [row] = await db
    .select({ position: sql<number>`coalesce(max(${chapters.position}), 0)::int` })
    .from(chapters)
    .where(and(eq(chapters.workId, workId), isNull(chapters.archivedAt)))
  return row?.position ?? 0
}

/** Relations of a work with both entry names. Viewer role. Optionally only those touching one entry. */
export async function listRelations(
  db: Db,
  actor: Actor,
  workId: string,
  o?: { entryId?: string; includeArchived?: boolean },
): Promise<RelationView[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const source = alias(wikiEntries, 'source_entry')
  const target = alias(wikiEntries, 'target_entry')
  const conditions: (SQL | undefined)[] = [eq(relations.workId, workId)]
  if (!o?.includeArchived) conditions.push(isNull(relations.archivedAt))
  if (o?.entryId) {
    conditions.push(
      or(eq(relations.sourceEntryId, o.entryId), eq(relations.targetEntryId, o.entryId)),
    )
  }
  const rows = await db
    .select({ relation: relations, sourceName: source.name, targetName: target.name })
    .from(relations)
    .innerJoin(source, eq(source.id, relations.sourceEntryId))
    .innerJoin(target, eq(target.id, relations.targetEntryId))
    .where(and(...conditions))
    .orderBy(asc(relations.createdAt))
  return rows.map((r) => ({ ...r.relation, sourceName: r.sourceName, targetName: r.targetName }))
}

/** Adds a relation between two cards of the same work. Editor role. */
export async function createRelation(
  db: Db,
  actor: Actor,
  input: RelationInput,
  o?: ChangeOpts,
): Promise<RelationRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const kind = requireKind(input.kind)
  const startPosition = input.startPosition ?? null
  const endPosition = input.endPosition ?? null
  validateShape(input.sourceEntryId, input.targetEntryId, startPosition, endPosition)
  const names = await requireActiveEntriesInWork(db, input.workId, [
    input.sourceEntryId,
    input.targetEntryId,
  ])
  const proposerType = o?.proposerType ?? 'author'

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(relations)
      .values({
        workId: input.workId,
        sourceEntryId: input.sourceEntryId,
        targetEntryId: input.targetEntryId,
        kind,
        description: input.description?.trim() ?? '',
        directed: input.directed ?? false,
        startPosition,
        endPosition,
        createdByType: proposerType,
      })
      .returning()
    await recordChange(tx, {
      workId: input.workId,
      targetTable: 'relations',
      targetId: row.id,
      action: 'create',
      before: null,
      after: row,
      proposerType,
      actorId: actor.userId,
      proposalId: o?.proposalId ?? null,
      summary: `관계 '${names.get(input.sourceEntryId)}' - '${names.get(input.targetEntryId)}' (${kind}) 추가`,
    })
    return row
  })
}

/** Edits a relation. The merged values are checked with the same rules as createRelation. */
export async function updateRelation(
  db: Db,
  actor: Actor,
  relationId: string,
  patch: RelationPatch,
  o?: ChangeOpts,
): Promise<RelationRow> {
  const workId = await requireRowWork(db, 'relations', relationId)
  await requireWorkRole(db, workId, actor.userId, 'editor')

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(relations).where(eq(relations.id, relationId)).limit(1)
    if (!before) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
    if (before.archivedAt) throw new AppError('BAD_STATE', '보관된 관계입니다.')

    const sourceEntryId = patch.sourceEntryId ?? before.sourceEntryId
    const targetEntryId = patch.targetEntryId ?? before.targetEntryId
    const startPosition =
      patch.startPosition !== undefined ? patch.startPosition : before.startPosition
    const endPosition = patch.endPosition !== undefined ? patch.endPosition : before.endPosition
    validateShape(sourceEntryId, targetEntryId, startPosition, endPosition)
    const kind = patch.kind !== undefined ? requireKind(patch.kind) : before.kind
    const names = await requireActiveEntriesInWork(tx, workId, [sourceEntryId, targetEntryId])

    const [updated] = await tx
      .update(relations)
      .set({
        sourceEntryId,
        targetEntryId,
        kind,
        description:
          patch.description !== undefined ? patch.description.trim() : before.description,
        directed: patch.directed ?? before.directed,
        startPosition,
        endPosition,
        updatedAt: new Date(),
      })
      .where(eq(relations.id, relationId))
      .returning()
    await recordChange(tx, {
      workId,
      targetTable: 'relations',
      targetId: relationId,
      action: 'update',
      before,
      after: updated,
      proposerType: o?.proposerType ?? 'author',
      actorId: actor.userId,
      proposalId: o?.proposalId ?? null,
      summary: `관계 '${names.get(sourceEntryId)}' - '${names.get(targetEntryId)}' (${kind}) 수정`,
    })
    return updated
  })
}

/** Archives a relation (never deleted). It stops showing in the list and the graph. */
export async function archiveRelation(
  db: Db,
  actor: Actor,
  relationId: string,
  o?: ChangeOpts,
): Promise<RelationRow> {
  const workId = await requireRowWork(db, 'relations', relationId)
  await requireWorkRole(db, workId, actor.userId, 'editor')

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(relations).where(eq(relations.id, relationId)).limit(1)
    if (!before) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
    if (before.archivedAt) throw new AppError('BAD_STATE', '이미 보관된 관계입니다.')

    const now = new Date()
    const [updated] = await tx
      .update(relations)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(relations.id, relationId))
      .returning()
    await recordChange(tx, {
      workId,
      targetTable: 'relations',
      targetId: relationId,
      action: 'archive',
      before,
      after: updated,
      proposerType: o?.proposerType ?? 'author',
      actorId: actor.userId,
      proposalId: o?.proposalId ?? null,
      summary: `관계 '${before.kind}' 보관`,
    })
    return updated
  })
}

/**
 * Data for the relationship graph: active cards as nodes (with first appearance chapter),
 * active relations between two active cards as edges, and the latest chapter position.
 * Viewer role. The client filters by chapter using startPosition, endPosition and firstAppearance.
 */
export async function getGraphData(db: Db, actor: Actor, workId: string): Promise<GraphData> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const entries = await db
    .select({ id: wikiEntries.id, name: wikiEntries.name, kind: wikiEntries.kind })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), isNull(wikiEntries.archivedAt)))
    .orderBy(asc(wikiEntries.name))
  const activeIds = new Set(entries.map((e) => e.id))
  const firstAppearances = await getFirstAppearances(db, workId)

  const relationRows = await db
    .select()
    .from(relations)
    .where(and(eq(relations.workId, workId), isNull(relations.archivedAt)))
    .orderBy(asc(relations.createdAt))
  const latestPosition = await latestChapterPosition(db, workId)

  return {
    nodes: entries.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      firstAppearance: firstAppearances.get(e.id) ?? null,
    })),
    edges: relationRows
      .filter((r) => activeIds.has(r.sourceEntryId) && activeIds.has(r.targetEntryId))
      .map((r) => ({
        id: r.id,
        source: r.sourceEntryId,
        target: r.targetEntryId,
        kind: r.kind,
        description: r.description,
        directed: r.directed,
        startPosition: r.startPosition,
        endPosition: r.endPosition,
      })),
    latestPosition,
  }
}
