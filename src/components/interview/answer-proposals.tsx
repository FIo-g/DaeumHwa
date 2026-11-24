'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { type ProposalDecision, ProposalCard } from '@/components/proposals/proposal-card'
import type { ProposalView } from '@/server/proposals'

type AnswerProposalsProps = {
  workId: string
  /** Pending proposals that the last answer produced. */
  proposals: ProposalView[]
  originalCount: number
}

/** Candidates from one interview answer, each with its own tag and approve / reject buttons. */
export function AnswerProposals({ workId, proposals, originalCount }: AnswerProposalsProps) {
  const [items] = useState(proposals)
  const [decisions, setDecisions] = useState<Record<string, ProposalDecision>>({})

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-ink">
        {originalCount > 0 ? '이 답의 후보 처리를 마쳤어요.' : '이 답에서 나온 새 제안이 없어요.'}
      </p>
    )
  }

  const pending = items.filter((item) => !decisions[item.id]).length

  return (
    <section aria-label="이 답에서 나온 제안" className="b-tools-candidates">
      <h2 className="font-bold">
        이 답에서 나온 제안{' '}
        <span className="text-sm font-normal text-muted-ink">{`대기 ${pending}건`}</span>
      </h2>
      {items.map((proposal) => {
        const decision = decisions[proposal.id]
        if (decision) {
          const approved = decision === 'approved'
          const Icon = approved ? CheckIcon : XIcon
          return (
            <div key={proposal.id} role="status" className="b-tools-stamp" data-approved={approved}>
              <Icon aria-hidden="true" />
              {approved ? '승인했어요.' : '거절했어요.'}
            </div>
          )
        }
        return (
          <div key={proposal.id} className="b-tools-candidate">
            <ProposalCard
              proposal={proposal}
              workId={workId}
              chapters={[]}
              onFinishDecision={(id, result) => {
                if (result) setDecisions((prev) => ({ ...prev, [id]: result }))
              }}
            />
          </div>
        )
      })}
    </section>
  )
}
