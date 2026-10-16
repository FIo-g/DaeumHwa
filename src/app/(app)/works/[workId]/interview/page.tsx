import { PageHeader } from '@/components/app/page-header'
import { InterviewSession } from '@/components/interview/interview-session'
import { hasRole } from '@/server/access'
import { getInterviewState } from '@/server/interview'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

// Interview (F1). Answering calls the AI extraction task.
export const maxDuration = 300

export default async function InterviewPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/interview`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const state = await guardPage(() => getInterviewState(db, actor, workId))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="인터뷰"
        description="질문에 답하면 설정 카드와 떡밥 후보가 만들어집니다. 후보는 승인 대기에서 확인합니다."
      />
      <InterviewSession
        workId={workId}
        canEdit={hasRole(work.role, 'editor')}
        sessionId={state.session?.id ?? null}
        turns={state.turns}
        current={state.current}
      />
    </div>
  )
}
