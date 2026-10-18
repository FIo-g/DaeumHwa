import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { proposals, threads, wikiEntries } from '@/db/schema'
import type { EntryKind, ThreadStatus } from '@/db/types'

// Names an extraction must not create again: wiki cards and threads, plus pending proposals that
// are still waiting for approval. Read-only.

export type KnownEntries = {
  active: { id: string; name: string; aliases: string[]; kind: EntryKind }[]
  pending: { name: string; aliases: string[]; kind: EntryKind }[]
  threads: { id: string; title: string; status: ThreadStatus }[]
  pendingThreadTitles: string[]
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
  const active = await db
    .select({
      id: wikiEntries.id,
      name: wikiEntries.name,
      aliases: wikiEntries.aliases,
      kind: wikiEntries.kind,
    })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), isNull(wikiEntries.archivedAt)))
    .orderBy(asc(wikiEntries.createdAt))

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
        inArray(proposals.type, ['entry_create', 'thread_create']),
      ),
    )
    .orderBy(asc(proposals.createdAt))

  const pending: KnownEntries['pending'] = []
  const pendingThreadTitles: string[] = []
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
    } else {
      const payload = row.payload as { title: string }
      pendingThreadTitles.push(payload.title)
    }
  }

  const threadRows = await db
    .select({ id: threads.id, title: threads.title, status: threads.status })
    .from(threads)
    .where(and(eq(threads.workId, workId), isNull(threads.archivedAt)))
    .orderBy(asc(threads.createdAt))

  return { active, pending, threads: threadRows, pendingThreadTitles }
}
