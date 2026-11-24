import type { AdviceResult } from '@/ai/tasks/direction-advice'
import { AdviceView, type AdviceRunView } from '@/components/advice/advice-view'
import { PageHeader } from '@/components/app/page-header'
import { TrialToolGate } from '@/components/app/trial-tool-gate'
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
    return (
      <TrialToolGate
        title="방향 조언"
        band="sand"
        description="AI가 열린 떡밥과 인물 상태, 최근 회차 요약을 읽고 다음 전개를 제안해요."
      />
    )
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
    <div className="wg-advice-page">
      <PageHeader title="방향 조언" />
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
