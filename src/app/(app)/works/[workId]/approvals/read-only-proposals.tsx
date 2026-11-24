import { AiBadge } from '@/components/app/ai-badge'
import { EmptyState } from '@/components/app/empty-state'
import { evidenceOf, summarizeProposal } from '@/components/proposals/proposal-summary'
import { chapterLabel, PROPOSAL_SOURCE_LABEL, PROPOSAL_TYPE_LABEL } from '@/lib/labels'
import type { ProposalView } from '@/server/proposals'

type ReadOnlyProposalsProps = {
  proposals: ProposalView[]
}

/** The approval queue for viewers and commenters: what is waiting, without approve or reject controls. */
export function ReadOnlyProposals({ proposals }: ReadOnlyProposalsProps) {
  if (proposals.length === 0) {
    return <EmptyState title="승인 대기 중인 제안이 없어요." />
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">승인과 거절은 편집자만 할 수 있어요.</p>
      <ul className="grid gap-3">
        {proposals.map((proposal) => {
          const summary = summarizeProposal(proposal.type, proposal.payload)
          const evidence = evidenceOf(proposal.type, proposal.payload)
          return (
            <li key={proposal.id} className="b-works-proposal">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <AiBadge />
                <span className="b-works-tag bg-sand">{PROPOSAL_TYPE_LABEL[proposal.type]}</span>
                <span>{PROPOSAL_SOURCE_LABEL[proposal.source]}</span>
                {proposal.chapterPosition !== null && (
                  <span>{chapterLabel(proposal.chapterPosition, proposal.chapterTitle)}</span>
                )}
              </div>
              <p className="b-subhead wrap-anywhere">{summary.headline}</p>
              {summary.detail && (
                <p className="b-label wrap-anywhere text-muted-ink">{summary.detail}</p>
              )}
              {evidence && (
                <figure className="b-works-evidence">
                  <figcaption className="b-label font-bold">근거</figcaption>
                  <blockquote className="b-quote wrap-anywhere">
                    &ldquo;{evidence}&rdquo;
                  </blockquote>
                </figure>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
