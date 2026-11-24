'use client'

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
      <p className="wg-import-write text-sm text-muted-ink">
        {originalCount > 0 ? '이 답의 후보 처리를 마쳤어요.' : '이 답에서 나온 새 제안이 없어요.'}
      </p>
    )
  }

  const pending = items.filter((item) => !decisions[item.id]).length

  return (
    <section aria-label="이 답에서 나온 제안" className="grid min-w-0 gap-3">
      <h2 className="wg-import-write b-subhead">
        이 답에서 나온 제안{' '}
        <span className="font-mono text-sm font-normal text-muted-ink">{`대기 ${pending}건`}</span>
      </h2>
      <ul className="wg-import-rows">
        {items.map((proposal) => {
          const decision = decisions[proposal.id]
          return (
            <li
              key={proposal.id}
              className="wg-import-row wg-import-proposal"
              data-type={proposal.type}
            >
              {decision ? (
                <div role="status" className="wg-import-write text-sm">
                  {decision === 'approved' ? '승인했어요.' : '거절했어요.'}
                </div>
              ) : (
                <ProposalCard
                  proposal={proposal}
                  workId={workId}
                  chapters={[]}
                  onFinishDecision={(id, result) => {
                    if (result) setDecisions((prev) => ({ ...prev, [id]: result }))
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
