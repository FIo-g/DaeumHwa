import { AiBadge } from '@/components/app/ai-badge'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { summarizeProposal } from '@/components/proposals/proposal-summary'
import { chapterLabel, PROPOSAL_SOURCE_LABEL, PROPOSAL_TYPE_LABEL } from '@/lib/labels'
import type { ProposalView } from '@/server/proposals'

type ReadOnlyProposalsProps = {
  proposals: ProposalView[]
}

/** The approval queue for viewers and commenters: what is waiting, without approve or reject controls. */
export function ReadOnlyProposals({ proposals }: ReadOnlyProposalsProps) {
  if (proposals.length === 0) {
    return <EmptyState title="승인 대기 중인 제안이 없습니다." />
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">승인과 거절은 편집자만 할 수 있습니다.</p>
      <ul className="grid gap-3">
        {proposals.map((proposal) => {
          const summary = summarizeProposal(proposal.type, proposal.payload)
          return (
            <li key={proposal.id} className="grid gap-2 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <AiBadge />
                <Badge variant="outline">{PROPOSAL_TYPE_LABEL[proposal.type]}</Badge>
                <span>{PROPOSAL_SOURCE_LABEL[proposal.source]}</span>
                {proposal.chapterPosition !== null && (
                  <span>{chapterLabel(proposal.chapterPosition, proposal.chapterTitle)}</span>
                )}
              </div>
              <p className="font-medium">{summary.headline}</p>
              {summary.detail && <p className="text-sm text-muted-foreground">{summary.detail}</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
