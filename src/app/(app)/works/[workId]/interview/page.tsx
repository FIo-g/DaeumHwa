import { MessagesSquareIcon } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { InterviewSession } from '@/components/interview/interview-session'
import { TrialToolGate } from '@/components/app/trial-tool-gate'
import { hasRole } from '@/server/access'
import { getInterviewState } from '@/server/interview'
import { guardPage, pageContext } from '@/server/page-helpers'
import { listProposals } from '@/server/proposals'
import { getWork } from '@/server/works'

// Interview (F1). Questions and answers call the AI through route handlers.
export const maxDuration = 300

export default async function InterviewPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor, user } = await pageContext(`/works/${workId}/interview`)
  const work = await guardPage(() => getWork(db, actor, workId))
  if (user.isAnonymous)
    return (
      <TrialToolGate
        title="인터뷰"
        band="sand"
        description="답에서 설정 카드와 떡밥 후보를 찾아요."
      />
    )
  const state = await guardPage(() => getInterviewState(db, actor, workId))
  const canEdit = hasRole(work.role, 'editor')
  const lastAnswer =
    canEdit && !state.current && state.turns.findLast((turn) => turn.answer !== null)
  const resumeProposals = lastAnswer
    ? await guardPage(() =>
        listProposals(db, actor, workId, { source: 'interview', sourceRef: lastAnswer.id }),
      )
    : []

  return (
    <div className="flex flex-col">
      <PageHeader
        title="인터뷰"
        band="sand"
        actions={
          <span className="b-tools-header-art" data-tool="interview" aria-hidden="true">
            <i />
            <i />
            <span>
              <MessagesSquareIcon />
            </span>
          </span>
        }
      />
      <InterviewSession
        workId={workId}
        canEdit={canEdit}
        sessionId={state.session?.id ?? null}
        turns={state.turns}
        current={state.current}
        resumeProposals={resumeProposals}
      />
    </div>
  )
}
