import '@/app/styles/b-tools.css'
import { SignpostIcon } from 'lucide-react'
import type { AdviceResult } from '@/ai/tasks/direction-advice'
import { AdviceView, type AdviceRunView } from '@/components/advice/advice-view'
import { PageHeader } from '@/components/app/page-header'
import { TRIAL_SIGNUP_MESSAGE } from '@/lib/trial'
import { hasRole } from '@/server/access'
import { listAdviceRuns } from '@/server/ai-features'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

// Direction advice runs an AI task on the server, so the request may take a while.
export const maxDuration = 300

export default async function AdvicePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor, user } = await pageContext(`/works/${workId}/advice`)
  const work = await guardPage(() => getWork(db, actor, workId))
  if (user.isAnonymous)
    return <PageHeader title="방향 조언" band="leaf" description={TRIAL_SIGNUP_MESSAGE} />
  const runs = await guardPage(() => listAdviceRuns(db, actor, workId))

  const views: AdviceRunView[] = []
  for (const run of runs) {
    if (!isAdviceResult(run.output)) continue
    views.push({
      id: run.id,
      createdAt: new Date(run.createdAt).toISOString(),
      result: run.output,
    })
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="방향 조언"
        band="leaf"
        actions={
          <span className="b-tools-header-art" data-tool="advice" aria-hidden="true">
            <i />
            <i />
            <span>
              <SignpostIcon />
            </span>
          </span>
        }
      />
      <AdviceView workId={workId} canRun={hasRole(work.role, 'editor')} runs={views} />
    </div>
  )
}

/** Stored run output is checked before it reaches the client. */
function isAdviceResult(value: unknown): value is AdviceResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<AdviceResult>
  return (
    Array.isArray(v.options) &&
    Array.isArray(v.warnings) &&
    typeof v.recommendedIndex === 'number' &&
    typeof v.recommendationReason === 'string'
  )
}
