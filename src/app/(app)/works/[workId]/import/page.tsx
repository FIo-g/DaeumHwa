import { FolderInputIcon } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { ImportWizard } from '@/components/import/import-wizard'
import { TrialToolGate } from '@/components/app/trial-tool-gate'
import { hasRole } from '@/server/access'
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

  return (
    <div className="flex flex-col">
      <PageHeader
        title="원고 가져오기"
        band="cream"
        actions={
          <span className="b-tools-header-art" data-tool="import" aria-hidden="true">
            <i />
            <i />
            <span>
              <FolderInputIcon />
            </span>
          </span>
        }
      />
      <ImportWizard workId={workId} canEdit={hasRole(work.role, 'editor')} jobs={jobs} />
    </div>
  )
}
