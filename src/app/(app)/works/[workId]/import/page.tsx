import { PageHeader } from '@/components/app/page-header'
import { ImportWizard } from '@/components/import/import-wizard'
import { hasRole } from '@/server/access'
import { listImportJobs } from '@/server/imports'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

// Manuscript import (F6). The page drives import jobs through the advance route, which calls AI.
export const maxDuration = 300

export default async function ImportPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/import`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const jobs = await guardPage(() => listImportJobs(db, actor, workId))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="원고 가져오기"
        description="기존 원고를 회차로 나눠 올리고, 설정 카드 후보를 뽑습니다."
      />
      <ImportWizard workId={workId} canEdit={hasRole(work.role, 'editor')} jobs={jobs} />
    </div>
  )
}
