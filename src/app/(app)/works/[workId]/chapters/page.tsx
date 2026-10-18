import { PageHeader } from '@/components/app/page-header'
import { type ChapterTableRow, ChapterTable } from '@/components/chapters/chapter-table'
import { NewChapterButton } from '@/components/chapters/new-chapter-button'
import { resolveWorkSettings } from '@/db/types'
import { hasRole } from '@/server/access'
import { guardPage, pageContext } from '@/server/page-helpers'
import { listChapters } from '@/server/chapters'
import { getWork } from '@/server/works'

export default async function ChaptersPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/chapters`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const rows = await guardPage(() => listChapters(db, actor, workId, { includeArchived: true }))
  const canEdit = hasRole(work.role, 'editor')
  const targetChars = resolveWorkSettings(work.settings).targetChars

  const chapters: ChapterTableRow[] = rows.map((c) => ({
    id: c.id,
    position: c.position,
    title: c.title,
    status: c.status,
    charCount: c.charCount,
    publishedOn: c.publishedOn,
    updatedAt: new Date(c.updatedAt).toISOString(),
    archivedAt: c.archivedAt ? new Date(c.archivedAt).toISOString() : null,
  }))
  const visibleCount = chapters.filter((c) => c.archivedAt === null).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="회차 관리"
        description={`${visibleCount}화`}
        actions={canEdit ? <NewChapterButton workId={workId} /> : undefined}
      />
      <ChapterTable
        workId={workId}
        chapters={chapters}
        targetChars={targetChars}
        canEdit={canEdit}
      />
    </div>
  )
}
