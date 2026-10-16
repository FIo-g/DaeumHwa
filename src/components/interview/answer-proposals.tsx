'use client'

import { useState } from 'react'
import { ProposalCard } from '@/components/proposals/proposal-card'
import type { ProposalView } from '@/server/proposals'

type AnswerProposalsProps = {
  workId: string
  /** Pending proposals that the last answer produced. */
  proposals: ProposalView[]
}

/** Candidates from one interview answer, each with its own tag and approve / reject buttons. */
export function AnswerProposals({ workId, proposals }: AnswerProposalsProps) {
  const [items, setItems] = useState(proposals)

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">이 답에서 새로 정리된 제안은 없습니다.</p>
  }

  return (
    <section aria-label="이 답에서 나온 제안" className="grid gap-3">
      <h2 className="font-semibold">
        이 답에서 나온 제안{' '}
        <span className="text-sm font-normal text-muted-foreground">{`${items.length}건`}</span>
      </h2>
      {items.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          workId={workId}
          chapters={[]}
          onDone={(id) => setItems((prev) => prev.filter((item) => item.id !== id))}
        />
      ))}
    </section>
  )
}
