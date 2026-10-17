import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { facts, wikiEntries } from '@/db/schema'
import type { EntryKind, EntryRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { stripJosa } from '@/lib/korean/josa'

// Name rules shared by the wiki, facts and revert services. This is a leaf module: it must not
// import changes.ts or facts.ts, because both of them import it.

/**
 * Finds the entry `name` refers to. The exact text wins over the particle-stripped text
 * (마리아 is never read as 마리), and names win over aliases within each tier.
 * Rows are checked in the order given.
 */
export function matchEntryByName<T extends { name: string; aliases: string[] }>(
  rows: T[],
  name: string,
): T | null {
  const exact = name.trim()
  if (!exact) return null
  const stripped = stripJosa(exact)
  const forms = stripped && stripped !== exact ? [exact, stripped] : [exact]
  for (const form of forms) {
    const byName = rows.find((e) => e.name === form)
    if (byName) return byName
    const byAlias = rows.find((e) => e.aliases.includes(form))
    if (byAlias) return byAlias
  }
  return null
}

/** Finds the active entry of a work whose name or alias matches `name`. */
export async function findEntryByName(
  db: Db,
  workId: string,
  name: string,
): Promise<EntryRow | null> {
  if (!name.trim()) return null
  const rows = await db
    .select()
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), isNull(wikiEntries.archivedAt)))
    .orderBy(asc(wikiEntries.name))
  return matchEntryByName(rows, name)
}

/** Active entries share one kind + name. `exceptId` skips the entry being edited. */
export async function assertEntryNameFree(
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

/**
 * Links unlinked facts of the work whose subject resolves to this entry (see matchEntryByName).
 * Returns the number of facts linked. No change_log row: linking is derived.
 */
export async function relinkFactsForEntry(db: Db, entry: EntryRow): Promise<number> {
  const orphans = await db
    .select({ id: facts.id, subjectName: facts.subjectName })
    .from(facts)
    .where(and(eq(facts.workId, entry.workId), isNull(facts.entryId), isNull(facts.archivedAt)))
  if (orphans.length === 0) return 0
  const active = await db
    .select({ id: wikiEntries.id, name: wikiEntries.name, aliases: wikiEntries.aliases })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, entry.workId), isNull(wikiEntries.archivedAt)))
  const ids = orphans
    .filter((f) => matchEntryByName(active, f.subjectName)?.id === entry.id)
    .map((f) => f.id)
  if (ids.length === 0) return 0
  await db
    .update(facts)
    .set({ entryId: entry.id, updatedAt: new Date() })
    .where(inArray(facts.id, ids))
  return ids.length
}
