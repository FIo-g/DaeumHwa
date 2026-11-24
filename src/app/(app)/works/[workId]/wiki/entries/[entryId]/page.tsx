import { notFound } from 'next/navigation'
import { EntryDetail } from '@/components/wiki/entry-detail'
import { ENTRY_KINDS, type EntryKind } from '@/db/types'
import { hasRole } from '@/server/access'
import { listChanges } from '@/server/changes'
import { listChapters } from '@/server/chapters'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getEntry, listEntries } from '@/server/wiki'

export default async function EntryPage({
  params,
}: {
  params: Promise<{ workId: string; entryId: string }>
}) {
  const { workId, entryId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/wiki/entries/${entryId}`)
  const entry = await guardPage(() => getEntry(db, actor, entryId))
  if (entry.workId !== workId) notFound()

  const kinds: EntryKind[] =
    entry.kind === 'character' ? ['character'] : ENTRY_KINDS.filter((kind) => kind !== 'character')
  const [chapters, changes, entries] = await Promise.all([
    guardPage(() => listChapters(db, actor, workId)),
    guardPage(() => listChanges(db, actor, workId, { targetId: entryId, limit: 50 })),
    guardPage(() =>
      listEntries(db, actor, workId, { kinds, includeArchived: entry.archivedAt !== null }),
    ),
  ])
  const entryNumber = entries.findIndex((item) => item.id === entryId) + 1

  return (
    <EntryDetail
      workId={workId}
      entry={entry}
      entryNumber={entryNumber}
      canEdit={hasRole(entry.role, 'editor')}
      chapters={chapters.map((c) => ({ id: c.id, position: c.position, title: c.title }))}
      changes={changes}
    />
  )
}
