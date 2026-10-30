import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, facts, wikiEntries } from '@/db/schema'
import type {
  Actor,
  ChangeRow,
  EntryRow,
  FactRow,
  FactSourceType,
  FactStatus,
  ProposerType,
} from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireRowWork, requireWorkRole } from '@/server/access'
import {
  detachFromPredecessor,
  preview,
  type RecordChangeInput,
  recordChange,
} from '@/server/changes'
import { findEntryByName, relinkFactsForEntry } from '@/server/entry-integrity'

// Facts keep the name-matching and entry-link helpers in entry-integrity.ts, so changes.ts can
// use them without importing this file. Re-exported here for existing callers.
export { findEntryByName, preview, relinkFactsForEntry }

// Shared by wiki.ts, naming.ts and styles.ts. Lives here because facts need entry lookups
// and wiki entries need facts; keeping it in one direction avoids an import cycle.

/** Who proposed a change. Defaults to the author acting directly. */
export type ChangeOpts = { proposerType?: ProposerType; proposalId?: string | null }

/** Records one change_log row as the acting user. Pass a transaction as `db` for atomic writes. */
export function logChange(
  db: Db,
  actor: Actor,
  o: ChangeOpts | undefined,
  change: Omit<RecordChangeInput, 'proposerType' | 'actorId' | 'proposalId'>,
): Promise<ChangeRow> {
  return recordChange(db, {
    ...change,
    proposerType: o?.proposerType ?? 'author',
    proposalId: o?.proposalId ?? null,
    actorId: actor.userId,
  })
}

/** The entry must belong to the work. Archived entries are allowed as link targets. */
export async function assertEntryInWork(
  db: Db,
  workId: string,
  entryId: string,
): Promise<EntryRow> {
  const [entry] = await db
    .select()
    .from(wikiEntries)
    .where(and(eq(wikiEntries.id, entryId), eq(wikiEntries.workId, workId)))
    .limit(1)
  if (!entry) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return entry
}

/** The chapter must belong to the work. */
export async function assertChapterInWork(
  db: Db,
  workId: string,
  chapterId: string,
): Promise<void> {
  const [chapter] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.id, chapterId), eq(chapters.workId, workId)))
    .limit(1)
  if (!chapter) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
}

// ---- Reads ----

export type FactView = FactRow & {
  sourceChapter: { id: string; position: number; title: string; archived: boolean } | null
  supersededBy: { id: string; content: string; validFromPosition: number | null } | null
}

const STATUS_RANK: Record<FactStatus, number> = { confirmed: 0, assumed: 1, undecided: 2 }

export type FactListFilter = {
  entryId?: string
  chapterId?: string
  status?: FactStatus
  includeArchived?: boolean
  includeSuperseded?: boolean
}

function liveSuccessor(
  successorId: string | null,
  byId: Map<
    string,
    { id: string; content: string; validFromPosition: number | null; archivedAt: Date | null }
  >,
): FactView['supersededBy'] {
  if (!successorId) return null
  const successor = byId.get(successorId)
  if (!successor || successor.archivedAt) return null
  return {
    id: successor.id,
    content: successor.content,
    validFromPosition: successor.validFromPosition,
  }
}

/** Facts of a work. Active facts come first, then by status (confirmed, assumed, undecided), then by creation. */
export async function listFacts(
  db: Db,
  actor: Actor,
  workId: string,
  o: FactListFilter = {},
): Promise<FactView[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions = [eq(facts.workId, workId)]
  if (o.entryId) conditions.push(eq(facts.entryId, o.entryId))
  if (o.chapterId) conditions.push(eq(facts.sourceChapterId, o.chapterId))
  if (o.status) conditions.push(eq(facts.status, o.status))
  if (!o.includeArchived) conditions.push(isNull(facts.archivedAt))
  // A fact counts as superseded only while its replacement is live. Archived replacements are
  // skipped so the fact stays visible (see archiveFact, which normally re-links the fact already).
  if (!o.includeSuperseded) {
    conditions.push(
      sql`(${facts.supersededByFactId} is null or exists (select 1 from facts as successor where successor.id = ${facts.supersededByFactId} and successor.archived_at is not null))`,
    )
  }

  const rows = await db
    .select({
      fact: facts,
      chapterId: chapters.id,
      chapterPosition: chapters.position,
      chapterTitle: chapters.title,
      chapterArchivedAt: chapters.archivedAt,
    })
    .from(facts)
    .leftJoin(chapters, eq(chapters.id, facts.sourceChapterId))
    .where(and(...conditions))

  const successorIds = [
    ...new Set(rows.map((r) => r.fact.supersededByFactId).filter((id): id is string => !!id)),
  ]
  const successors =
    successorIds.length > 0
      ? await db
          .select({
            id: facts.id,
            content: facts.content,
            validFromPosition: facts.validFromPosition,
            archivedAt: facts.archivedAt,
          })
          .from(facts)
          .where(inArray(facts.id, successorIds))
      : []
  const successorById = new Map(successors.map((s) => [s.id, s]))

  const views: FactView[] = rows.map((r) => ({
    ...r.fact,
    sourceChapter: r.chapterId
      ? {
          id: r.chapterId,
          position: r.chapterPosition ?? 0,
          title: r.chapterTitle ?? '',
          archived: r.chapterArchivedAt !== null,
        }
      : null,
    supersededBy: liveSuccessor(r.fact.supersededByFactId, successorById),
  }))

  return views.sort(
    (a, b) =>
      Number(a.supersededBy !== null) - Number(b.supersededBy !== null) ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  )
}

/** Facts that hold at a chapter position: started by then, not ended before it, not archived. */
export function factsValidAt<
  T extends Pick<FactRow, 'archivedAt' | 'validFromPosition' | 'validToPosition'>,
>(list: T[], position: number): T[] {
  return list.filter(
    (f) =>
      f.archivedAt === null &&
      (f.validFromPosition ?? Number.NEGATIVE_INFINITY) <= position &&
      position <= (f.validToPosition ?? Number.POSITIVE_INFINITY),
  )
}

// ---- Writes ----

export type FactInput = {
  workId: string
  entryId?: string | null
  subjectName?: string
  content: string
  status: FactStatus
  sourceType: FactSourceType
  sourceChapterId?: string | null
  evidence?: string
  validFromPosition?: number | null
  validToPosition?: number | null
  revealAtPosition?: number | null
}

export type FactPatch = Partial<
  Pick<
    FactRow,
    | 'content'
    | 'status'
    | 'entryId'
    | 'evidence'
    | 'sourceChapterId'
    | 'validFromPosition'
    | 'validToPosition'
    | 'revealAtPosition'
  >
>

export type SupersedeInput = {
  factId: string
  fromPosition: number
  content: string
  status: FactStatus
  evidence?: string
  sourceChapterId?: string | null
  sourceType?: FactSourceType
  /** Omitted: the old fact's reveal chapter carries over. Null clears the lock. */
  revealAtPosition?: number | null
}

async function loadFact(db: Db, factId: string): Promise<FactRow> {
  const [row] = await db.select().from(facts).where(eq(facts.id, factId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

function requireContent(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) throw new AppError('VALIDATION', '사실 내용을 입력하세요.')
  return trimmed
}

/** The chapter from which a fact may be written in drafts (spoiler lock). Null or undefined pass through. */
function requireReveal(position: number | null | undefined): number | null | undefined {
  if (position === null || position === undefined) return position
  if (!Number.isInteger(position) || position < 1) {
    throw new AppError('VALIDATION', '공개 회차는 1 이상으로 적어 주세요.')
  }
  return position
}

export async function createFact(
  db: Db,
  actor: Actor,
  input: FactInput,
  o: ChangeOpts = {},
): Promise<FactRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const content = requireContent(input.content)
  const typedSubject = (input.subjectName ?? '').trim()

  let entryId: string | null = null
  let subjectName = typedSubject
  if (input.entryId) {
    const entry = await assertEntryInWork(db, input.workId, input.entryId)
    entryId = entry.id
    if (!subjectName) subjectName = entry.name
  } else if (typedSubject) {
    entryId = (await findEntryByName(db, input.workId, typedSubject))?.id ?? null
  }
  if (input.sourceChapterId) {
    await assertChapterInWork(db, input.workId, input.sourceChapterId)
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(facts)
      .values({
        workId: input.workId,
        entryId,
        subjectName,
        content,
        status: input.status,
        sourceType: input.sourceType,
        sourceChapterId: input.sourceChapterId ?? null,
        evidence: (input.evidence ?? '').trim(),
        validFromPosition: input.validFromPosition ?? null,
        validToPosition: input.validToPosition ?? null,
        revealAtPosition: requireReveal(input.revealAtPosition) ?? null,
        createdByType: o.proposerType ?? 'author',
      })
      .returning()
    await logChange(tx, actor, o, {
      workId: input.workId,
      targetTable: 'facts',
      targetId: row.id,
      action: 'create',
      before: null,
      after: row,
      summary: `사실 추가: ${preview(row.content)}`,
    })
    return row
  })
}

export async function updateFact(
  db: Db,
  actor: Actor,
  factId: string,
  patch: FactPatch,
  o: ChangeOpts = {},
): Promise<FactRow> {
  const workId = await requireRowWork(db, 'facts', factId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadFact(db, factId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '보관된 사실은 수정할 수 없습니다.')

  const set: Partial<typeof facts.$inferInsert> = {}
  if (patch.content !== undefined) set.content = requireContent(patch.content)
  if (patch.status !== undefined) set.status = patch.status
  if (patch.entryId !== undefined) {
    if (patch.entryId) await assertEntryInWork(db, workId, patch.entryId)
    set.entryId = patch.entryId
  }
  if (patch.evidence !== undefined) set.evidence = patch.evidence.trim()
  if (patch.sourceChapterId !== undefined) {
    if (patch.sourceChapterId) await assertChapterInWork(db, workId, patch.sourceChapterId)
    set.sourceChapterId = patch.sourceChapterId
  }
  if (patch.validFromPosition !== undefined) set.validFromPosition = patch.validFromPosition
  if (patch.validToPosition !== undefined) set.validToPosition = patch.validToPosition
  if (patch.revealAtPosition !== undefined) {
    set.revealAtPosition = requireReveal(patch.revealAtPosition)
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(facts)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(facts.id, factId))
      .returning()
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'facts',
      targetId: factId,
      action: 'update',
      before: current,
      after: row,
      summary: `사실 수정: ${preview(row.content)}`,
    })
    return row
  })
}

export async function archiveFact(
  db: Db,
  actor: Actor,
  factId: string,
  o: ChangeOpts = {},
): Promise<FactRow> {
  const workId = await requireRowWork(db, 'facts', factId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadFact(db, factId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '이미 보관된 사실입니다.')

  return db.transaction(async (tx) => {
    const now = new Date()
    const [row] = await tx
      .update(facts)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(facts.id, factId))
      .returning()
    // If this fact replaced an earlier one, that one becomes valid again (or points at a live successor).
    const predecessor = await detachFromPredecessor(tx, workId, actor.userId, current, o)
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'facts',
      targetId: factId,
      action: 'archive',
      before: predecessor ? { ...current, reopenedPredecessor: predecessor } : current,
      after: row,
      summary: `사실 보관: ${preview(row.content)}`,
    })
    return row
  })
}

/**
 * Replaces a fact from `fromPosition` on. The old fact ends at fromPosition - 1 and points to
 * the new one; the new fact starts at fromPosition and keeps the same entry and subject.
 */
export async function supersedeFact(
  db: Db,
  actor: Actor,
  input: SupersedeInput,
  o: ChangeOpts = {},
): Promise<{ oldFact: FactRow; newFact: FactRow }> {
  const workId = await requireRowWork(db, 'facts', input.factId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const old = await loadFact(db, input.factId)
  if (old.archivedAt) throw new AppError('BAD_STATE', '보관된 사실은 바꿀 수 없습니다.')
  if (old.supersededByFactId) {
    const [successor] = await db
      .select({ archivedAt: facts.archivedAt })
      .from(facts)
      .where(eq(facts.id, old.supersededByFactId))
      .limit(1)
    if (successor && !successor.archivedAt) {
      throw new AppError('CONFLICT', '이미 다른 사실로 바뀐 사실입니다.')
    }
  }
  if (input.fromPosition <= (old.validFromPosition ?? 0)) {
    throw new AppError('VALIDATION', '바뀌는 회차는 기존 사실이 유효해진 회차 이후여야 합니다.')
  }
  const content = requireContent(input.content)
  if (input.sourceChapterId) {
    await assertChapterInWork(db, workId, input.sourceChapterId)
  }

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(facts)
      .values({
        workId,
        entryId: old.entryId,
        subjectName: old.subjectName,
        content,
        status: input.status,
        sourceType: input.sourceType ?? 'author',
        sourceChapterId: input.sourceChapterId ?? null,
        evidence: (input.evidence ?? '').trim(),
        validFromPosition: input.fromPosition,
        validToPosition: null,
        revealAtPosition:
          input.revealAtPosition !== undefined
            ? (requireReveal(input.revealAtPosition) ?? null)
            : old.revealAtPosition,
        createdByType: o.proposerType ?? 'author',
      })
      .returning()
    const [ended] = await tx
      .update(facts)
      .set({
        validToPosition: input.fromPosition - 1,
        supersededByFactId: created.id,
        updatedAt: new Date(),
      })
      .where(eq(facts.id, old.id))
      .returning()

    await logChange(tx, actor, o, {
      workId,
      targetTable: 'facts',
      targetId: old.id,
      action: 'update',
      before: old,
      after: ended,
      summary: `사실 교체 전: ${preview(old.content)}`,
    })
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'facts',
      targetId: created.id,
      action: 'create',
      before: null,
      after: created,
      summary: `사실 교체 후: ${preview(created.content)}`,
    })
    return { oldFact: ended, newFact: created }
  })
}
