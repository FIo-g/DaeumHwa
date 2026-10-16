import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { relations, threadEntries, threads, wikiEntries } from '@/db/schema'
import type { Actor, EntryKind, EntryRow, Role, ThreadStatus } from '@/db/types'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import { AppError } from '@/lib/errors'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { getEntryAppearances, recomputeAppearancesForEntry } from '@/server/appearances'
import {
  type ChangeOpts,
  type FactView,
  listFacts,
  logChange,
  relinkFactsForEntry,
} from '@/server/facts'

export type { ChangeOpts } from '@/server/facts'
export { findEntryByName } from '@/server/facts'

export type EntryInput = {
  kind: EntryKind
  name: string
  aliases?: string[]
  summary?: string
  body?: string
  fields?: Record<string, string>
  customFields?: { key: string; value: string }[]
}

export type EntryDetail = EntryRow & {
  role: Role
  facts: FactView[]
  relations: {
    id: string
    otherEntryId: string
    otherName: string
    kind: string
    description: string
    direction: 'out' | 'in'
    directed: boolean
    startPosition: number | null
    endPosition: number | null
  }[]
  appearances: { chapterId: string; position: number; title: string; mentionCount: number }[]
  threads: { id: string; title: string; status: ThreadStatus }[]
}

// ---- Normalization ----

function normalizeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new AppError('VALIDATION', '이름을 입력하세요.')
  return trimmed
}

/** Trims, drops empty values, and removes duplicates and any alias equal to the name. */
function normalizeAliases(name: string, aliases: string[]): string[] {
  const seen = new Set<string>([name])
  const out: string[] = []
  for (const raw of aliases) {
    const alias = raw.trim()
    if (!alias || seen.has(alias)) continue
    seen.add(alias)
    out.push(alias)
  }
  return out
}

function normalizeEntry(input: EntryInput) {
  const name = normalizeName(input.name)
  const fields = Object.fromEntries(
    Object.entries(input.fields ?? {})
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key]) => key !== ''),
  )
  const customFields = (input.customFields ?? [])
    .map((c) => ({ key: c.key.trim(), value: c.value.trim() }))
    .filter((c) => c.key !== '')
  return {
    kind: input.kind,
    name,
    aliases: normalizeAliases(name, input.aliases ?? []),
    summary: (input.summary ?? '').trim(),
    body: input.body ?? '',
    fields,
    customFields,
  }
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

async function loadEntry(db: Db, entryId: string): Promise<EntryRow> {
  const [row] = await db.select().from(wikiEntries).where(eq(wikiEntries.id, entryId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

/** Active entries share one kind + name. `exceptId` skips the entry being edited. */
async function assertNameFree(
  db: Db,
  workId: string,
  kind: EntryKind,
  name: string,
  exceptId?: string,
): Promise<void> {
  const [dup] = await db
    .select({ id: wikiEntries.id })
    .from(wikiEntries)
    .where(
      and(
        eq(wikiEntries.workId, workId),
        eq(wikiEntries.kind, kind),
        eq(wikiEntries.name, name),
        isNull(wikiEntries.archivedAt),
        exceptId ? ne(wikiEntries.id, exceptId) : undefined,
      ),
    )
    .limit(1)
  if (dup) throw new AppError('CONFLICT', '같은 이름의 카드가 이미 있습니다.')
}

// ---- Reads ----

export async function listEntries(
  db: Db,
  actor: Actor,
  workId: string,
  o: { kinds?: EntryKind[]; includeArchived?: boolean; query?: string } = {},
): Promise<EntryRow[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions = [eq(wikiEntries.workId, workId)]
  if (o.kinds && o.kinds.length > 0) conditions.push(inArray(wikiEntries.kind, o.kinds))
  if (!o.includeArchived) conditions.push(isNull(wikiEntries.archivedAt))
  const rows = await db
    .select()
    .from(wikiEntries)
    .where(and(...conditions))
    .orderBy(asc(wikiEntries.name))

  const query = o.query?.trim().toLowerCase()
  if (!query) return rows
  return rows.filter((e) =>
    [e.name, ...e.aliases, e.summary].some((text) => text.toLowerCase().includes(query)),
  )
}

export async function getEntry(db: Db, actor: Actor, entryId: string): Promise<EntryDetail> {
  const workId = await requireRowWork(db, 'wiki_entries', entryId)
  const { role } = await requireWorkRole(db, workId, actor.userId, 'viewer')
  const entry = await loadEntry(db, entryId)

  const [entryFacts, appearances, relationRows, threadRows] = await Promise.all([
    listFacts(db, actor, workId, { entryId, includeSuperseded: true }),
    getEntryAppearances(db, entryId),
    db
      .select({
        id: relations.id,
        sourceEntryId: relations.sourceEntryId,
        targetEntryId: relations.targetEntryId,
        kind: relations.kind,
        description: relations.description,
        directed: relations.directed,
        startPosition: relations.startPosition,
        endPosition: relations.endPosition,
      })
      .from(relations)
      .where(
        and(
          eq(relations.workId, workId),
          isNull(relations.archivedAt),
          or(eq(relations.sourceEntryId, entryId), eq(relations.targetEntryId, entryId)),
        ),
      ),
    db
      .select({ id: threads.id, title: threads.title, status: threads.status })
      .from(threadEntries)
      .innerJoin(threads, eq(threads.id, threadEntries.threadId))
      .where(and(eq(threadEntries.entryId, entryId), isNull(threads.archivedAt)))
      .orderBy(asc(threads.title)),
  ])

  const otherIds = [
    ...new Set(
      relationRows.map((r) => (r.sourceEntryId === entryId ? r.targetEntryId : r.sourceEntryId)),
    ),
  ]
  const others =
    otherIds.length > 0
      ? await db
          .select({ id: wikiEntries.id, name: wikiEntries.name })
          .from(wikiEntries)
          .where(inArray(wikiEntries.id, otherIds))
      : []
  const nameById = new Map(others.map((o) => [o.id, o.name]))

  return {
    ...entry,
    role,
    facts: entryFacts,
    relations: relationRows.map((r) => {
      const outgoing = r.sourceEntryId === entryId
      const otherEntryId = outgoing ? r.targetEntryId : r.sourceEntryId
      return {
        id: r.id,
        otherEntryId,
        otherName: nameById.get(otherEntryId) ?? '',
        kind: r.kind,
        description: r.description,
        direction: outgoing ? 'out' : 'in',
        directed: r.directed,
        startPosition: r.startPosition,
        endPosition: r.endPosition,
      }
    }),
    appearances,
    threads: threadRows,
  }
}

// ---- Writes ----

export async function createEntry(
  db: Db,
  actor: Actor,
  input: EntryInput & { workId: string },
  o: ChangeOpts = {},
): Promise<EntryRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const values = normalizeEntry(input)
  await assertNameFree(db, input.workId, values.kind, values.name)

  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(wikiEntries)
      .values({
        workId: input.workId,
        ...values,
        createdByType: o.proposerType ?? 'author',
      })
      .returning()
    await logChange(tx, actor, o, {
      workId: input.workId,
      targetTable: 'wiki_entries',
      targetId: entry.id,
      action: 'create',
      before: null,
      after: entry,
      summary: `${ENTRY_KIND_LABEL[entry.kind]} '${entry.name}' 생성`,
    })
    await relinkFactsForEntry(tx, entry)
    await recomputeAppearancesForEntry(tx, entry.id)
    return entry
  })
}

export async function updateEntry(
  db: Db,
  actor: Actor,
  entryId: string,
  patch: Partial<EntryInput>,
  o: ChangeOpts = {},
): Promise<EntryRow> {
  const workId = await requireRowWork(db, 'wiki_entries', entryId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadEntry(db, entryId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '보관된 카드는 수정할 수 없습니다.')

  const values = normalizeEntry({
    kind: patch.kind ?? current.kind,
    name: patch.name ?? current.name,
    aliases: patch.aliases ?? current.aliases,
    summary: patch.summary ?? current.summary,
    body: patch.body ?? current.body,
    fields: patch.fields ?? current.fields,
    customFields: patch.customFields ?? current.customFields,
  })
  await assertNameFree(db, workId, values.kind, values.name, entryId)
  const namesChanged = values.name !== current.name || !sameList(values.aliases, current.aliases)

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(wikiEntries)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(wikiEntries.id, entryId))
      .returning()
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'wiki_entries',
      targetId: entryId,
      action: 'update',
      before: current,
      after: updated,
      summary: `${ENTRY_KIND_LABEL[updated.kind]} '${updated.name}' 수정`,
    })
    if (namesChanged) {
      await relinkFactsForEntry(tx, updated)
      await recomputeAppearancesForEntry(tx, entryId)
    }
    return updated
  })
}

export async function archiveEntry(
  db: Db,
  actor: Actor,
  entryId: string,
  o: ChangeOpts = {},
): Promise<EntryRow> {
  const workId = await requireRowWork(db, 'wiki_entries', entryId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadEntry(db, entryId)
  if (current.archivedAt) throw new AppError('BAD_STATE', '이미 보관된 카드입니다.')

  return db.transaction(async (tx) => {
    const now = new Date()
    const [row] = await tx
      .update(wikiEntries)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(wikiEntries.id, entryId))
      .returning()
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'wiki_entries',
      targetId: entryId,
      action: 'archive',
      before: current,
      after: row,
      summary: `${ENTRY_KIND_LABEL[row.kind]} '${row.name}' 보관`,
    })
    // Archived entries have no appearances.
    await recomputeAppearancesForEntry(tx, entryId)
    return row
  })
}

export async function restoreEntry(
  db: Db,
  actor: Actor,
  entryId: string,
  o: ChangeOpts = {},
): Promise<EntryRow> {
  const workId = await requireRowWork(db, 'wiki_entries', entryId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const current = await loadEntry(db, entryId)
  if (!current.archivedAt) throw new AppError('BAD_STATE', '보관된 카드가 아닙니다.')
  await assertNameFree(db, workId, current.kind, current.name, entryId)

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(wikiEntries)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(wikiEntries.id, entryId))
      .returning()
    await logChange(tx, actor, o, {
      workId,
      targetTable: 'wiki_entries',
      targetId: entryId,
      action: 'restore',
      before: current,
      after: row,
      summary: `${ENTRY_KIND_LABEL[row.kind]} '${row.name}' 복원`,
    })
    await relinkFactsForEntry(tx, row)
    await recomputeAppearancesForEntry(tx, entryId)
    return row
  })
}
