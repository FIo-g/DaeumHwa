import { PageHeader } from '@/components/app/page-header'
import { ImportWizard } from '@/components/import/import-wizard'
import { TrialToolGate } from '@/components/app/trial-tool-gate'
import { chapterLabel } from '@/lib/labels'
import { hasRole } from '@/server/access'
import { listChapters } from '@/server/chapters'
import { listImportJobs } from '@/server/imports'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

// Manuscript import (F6). The page drives import jobs through the advance route, which calls AI.
export const maxDuration = 300

export default async function ImportPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor, user } = await pageContext(`/works/${workId}/import`)
  const work = await guardPage(() => getWork(db, actor, workId))
  if (user.isAnonymous)
    return (
      <TrialToolGate
        title="원고 가져오기"
        band="cream"
        description="txt, md, docx 파일을 올릴 수 있어요."
      />
    )
  const jobs = await guardPage(() => listImportJobs(db, actor, workId))
  const importedIds = new Set(jobs.flatMap((job) => job.chapterIds))
  const chapters = importedIds.size
    ? await guardPage(() => listChapters(db, actor, workId, { includeArchived: true }))
    : []
  const chapterLabels = Object.fromEntries(
    chapters
      .filter((chapter) => importedIds.has(chapter.id))
      .map(({ id, position, title }) => [id, chapterLabel(position, title)]),
  )

  return (
    <div className="wg-import-page flex flex-col" data-tool="import">
      <PageHeader title="원고 가져오기" />
      <ImportWizard
        workId={workId}
        canEdit={hasRole(work.role, 'editor')}
        jobs={jobs}
        chapterLabels={chapterLabels}
      />
    </div>
  )
}
