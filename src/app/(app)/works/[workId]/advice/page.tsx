import type { AdviceResult } from '@/ai/tasks/direction-advice'
import { AdviceView, type AdviceRunView } from '@/components/advice/advice-view'
import { PageHeader } from '@/components/app/page-header'
import { hasRole } from '@/server/access'
import { listAdviceRuns } from '@/server/ai-features'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

// Direction advice runs an AI task on the server, so the request may take a while.
export const maxDuration = 300

export default async function AdvicePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/advice`)
  const work = await guardPage(() => getWork(db, actor, workId))
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
      <PageHeader title="방향 조언" description="다음 전개 선택지를 받아 보고 참고합니다." />
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
