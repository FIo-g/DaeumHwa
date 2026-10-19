import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { facts, proposals, threads, wikiEntries } from '@/db/schema'
import type { EntryKind, ThreadStatus } from '@/db/types'

// Names an extraction must not create again: wiki cards and threads, plus pending proposals that
// are still waiting for approval. Read-only.

export type KnownEntries = {
  /** `speech` is the card's 말투 field, or '' when it has none. */
  active: { id: string; name: string; aliases: string[]; kind: EntryKind; speech: string }[]
  pending: { name: string; aliases: string[]; kind: EntryKind }[]
  threads: { id: string; title: string; status: ThreadStatus }[]
  pendingThreadTitles: string[]
  /** Entries with a pending entry_update that sets a non-empty speech. */
  pendingSpeechEntryIds: string[]
}

/** A fact the extraction must not repeat: a current wiki fact, or a pending fact_create. */
export type KnownFactText = {
  entryId: string | null
  subjectName: string
  content: string
  pending: boolean
}

/**
 * Loads the known names of a work. `pending` and `pendingThreadTitles` leave out proposals of
 * `excludePostChapterOf`, so a chapter check can recreate its own pending proposals.
 */
export async function loadKnownEntries(
  db: Db,
  workId: string,
  opts: { excludePostChapterOf?: string } = {},
): Promise<KnownEntries> {
  const activeRows = await db
    .select({
      id: wikiEntries.id,
      name: wikiEntries.name,
      aliases: wikiEntries.aliases,
      kind: wikiEntries.kind,
      fields: wikiEntries.fields,
    })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), isNull(wikiEntries.archivedAt)))
    .orderBy(asc(wikiEntries.createdAt))
  const active = activeRows.map(({ fields, ...entry }) => ({
    ...entry,
    speech: fields.speech ?? '',
  }))

  const pendingRows = await db
    .select({
      type: proposals.type,
      payload: proposals.payload,
      source: proposals.source,
      chapterId: proposals.chapterId,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.workId, workId),
        eq(proposals.status, 'pending'),
        inArray(proposals.type, ['entry_create', 'thread_create', 'entry_update']),
      ),
    )
    .orderBy(asc(proposals.createdAt))

  const pending: KnownEntries['pending'] = []
  const pendingThreadTitles: string[] = []
  const pendingSpeechEntryIds: string[] = []
  for (const row of pendingRows) {
    if (
      opts.excludePostChapterOf !== undefined &&
      row.source === 'post_chapter' &&
      row.chapterId === opts.excludePostChapterOf
    ) {
      continue
    }
    if (row.type === 'entry_create') {
      const payload = row.payload as { name: string; aliases: string[]; kind: EntryKind }
      pending.push({ name: payload.name, aliases: payload.aliases, kind: payload.kind })
    } else if (row.type === 'thread_create') {
      const payload = row.payload as { title: string }
      pendingThreadTitles.push(payload.title)
    } else if (row.type === 'entry_update') {
      const payload = row.payload as { entryId: string; patch: { fields?: Record<string, string> } }
      const speech = payload.patch.fields?.speech
      if (typeof speech === 'string' && speech.trim() !== '') {
        pendingSpeechEntryIds.push(payload.entryId)
      }
    }
  }

  const threadRows = await db
    .select({ id: threads.id, title: threads.title, status: threads.status })
    .from(threads)
    .where(and(eq(threads.workId, workId), isNull(threads.archivedAt)))
    .orderBy(asc(threads.createdAt))

  return { active, pending, threads: threadRows, pendingThreadTitles, pendingSpeechEntryIds }
}

/**
 * Fact texts of a work for the extraction dedupe: pending fact_create proposals first, then the
 * current wiki facts (not archived, superseded or ended). Read-only; no limit, the prompt caps it.
 */
export async function loadKnownFactTexts(db: Db, workId: string): Promise<KnownFactText[]> {
  const pendingRows = await db
    .select({ payload: proposals.payload })
    .from(proposals)
    .where(
      and(
        eq(proposals.workId, workId),
        eq(proposals.status, 'pending'),
        eq(proposals.type, 'fact_create'),
      ),
    )
    .orderBy(asc(proposals.createdAt))

  const wikiRows = await db
    .select({ entryId: facts.entryId, subjectName: facts.subjectName, content: facts.content })
    .from(facts)
    .where(
      and(
        eq(facts.workId, workId),
        isNull(facts.archivedAt),
        isNull(facts.supersededByFactId),
        isNull(facts.validToPosition),
      ),
    )
    .orderBy(desc(facts.createdAt))

  const pending = pendingRows.map(({ payload }) => {
    const p = payload as { entryId: string | null; subjectName: string; content: string }
    return {
      entryId: p.entryId ?? null,
      subjectName: p.subjectName,
      content: p.content,
      pending: true,
    }
  })
  return [...pending, ...wikiRows.map((f) => ({ ...f, pending: false }))]
}
