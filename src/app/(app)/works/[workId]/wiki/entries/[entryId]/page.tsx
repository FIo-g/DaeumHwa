import { notFound } from 'next/navigation'
import { EntryDetail } from '@/components/wiki/entry-detail'
import { hasRole } from '@/server/access'
import { listChanges } from '@/server/changes'
import { listChapters } from '@/server/chapters'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getEntry } from '@/server/wiki'

export default async function EntryPage({
  params,
}: {
  params: Promise<{ workId: string; entryId: string }>
}) {
  const { workId, entryId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/wiki/entries/${entryId}`)
  const entry = await guardPage(() => getEntry(db, actor, entryId))
  if (entry.workId !== workId) notFound()

  const [chapters, changes] = await Promise.all([
    guardPage(() => listChapters(db, actor, workId)),
    guardPage(() => listChanges(db, actor, workId, { targetId: entryId, limit: 50 })),
  ])

  return (
    <EntryDetail
      workId={workId}
      entry={entry}
      canEdit={hasRole(entry.role, 'editor')}
      chapters={chapters.map((c) => ({ id: c.id, position: c.position, title: c.title }))}
      changes={changes}
    />
  )
}
