import { and, count, eq } from 'drizzle-orm'
import { PageHeader } from '@/components/app/page-header'
import { type ChapterTableRow, ChapterTable } from '@/components/chapters/chapter-table'
import { NewChapterButton } from '@/components/chapters/new-chapter-button'
import { NextChapterButton } from '@/components/chapters/next-chapter-button'
import { issues, proposals } from '@/db/schema'
import { resolveWorkSettings } from '@/db/types'
import { hasRole } from '@/server/access'
import { guardPage, pageContext } from '@/server/page-helpers'
import { listChapters } from '@/server/chapters'
import { getWork } from '@/server/works'

export default async function ChaptersPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor, user } = await pageContext(`/works/${workId}/chapters`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const [rows, openIssues, pendingProposals] = await guardPage(() =>
    Promise.all([
      listChapters(db, actor, workId, { includeArchived: true }),
      db
        .select({ chapterId: issues.chapterId, total: count() })
        .from(issues)
        .where(and(eq(issues.workId, workId), eq(issues.status, 'open')))
        .groupBy(issues.chapterId),
      db
        .select({ chapterId: proposals.chapterId, total: count() })
        .from(proposals)
        .where(and(eq(proposals.workId, workId), eq(proposals.status, 'pending')))
        .groupBy(proposals.chapterId),
    ]),
  )
  const canEdit = hasRole(work.role, 'editor')
  const targetChars = resolveWorkSettings(work.settings).targetChars
  const issueCounts = new Map(openIssues.map(({ chapterId, total }) => [chapterId, total]))
  const proposalCounts = new Map(pendingProposals.map(({ chapterId, total }) => [chapterId, total]))

  const chapters: ChapterTableRow[] = rows.map((c) => ({
    id: c.id,
    position: c.position,
    title: c.title,
    status: c.status,
    charCount: c.charCount,
    issueCount: issueCounts.get(c.id) ?? 0,
    pendingProposalCount: proposalCounts.get(c.id) ?? 0,
    publishedOn: c.publishedOn,
    updatedAt: new Date(c.updatedAt).toISOString(),
    archivedAt: c.archivedAt ? new Date(c.archivedAt).toISOString() : null,
  }))
  const visibleCount = chapters.filter((c) => c.archivedAt === null).length

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="회차 관리"
        description={`회차 ${visibleCount}개`}
        actions={
          canEdit ? (
            <>
              <NewChapterButton workId={workId} />
              <NextChapterButton workId={workId} variant="link" />
            </>
          ) : undefined
        }
      />
      <ChapterTable
        workId={workId}
        chapters={chapters}
        targetChars={targetChars}
        canEdit={canEdit}
        trial={user.isAnonymous}
      />
    </div>
  )
}
