import type { ReactNode } from 'react'
import { AiBadge } from '@/components/app/ai-badge'
import { PROPOSAL_SOURCE_LABEL, PROPOSAL_TYPE_LABEL } from '@/lib/labels'
import type { ProposalView } from '@/server/proposals'
import { evidenceOf, summarizeProposal } from './proposal-summary'

export function ProposalDetails({
  proposal,
  payload = proposal.payload,
  chapter,
  compact = false,
}: {
  proposal: ProposalView
  payload?: unknown
  chapter?: ReactNode
  compact?: boolean
}) {
  const summary = summarizeProposal(proposal.type, payload)
  const evidence = compact ? null : evidenceOf(proposal.type, payload)

  return (
    <div className="wg-approvals-details">
      <div className="wg-approvals-meta">
        <AiBadge />
        <span className="wg-approvals-kind">{PROPOSAL_TYPE_LABEL[proposal.type]}</span>
        <span>{PROPOSAL_SOURCE_LABEL[proposal.source]}</span>
        {chapter}
      </div>
      <p className="b-subhead wrap-anywhere">{summary.headline}</p>
      {summary.detail && <p className="wg-approvals-detail">{summary.detail}</p>}
      {evidence && (
        <figure className="wg-approvals-evidence">
          <figcaption className="b-label font-medium">근거</figcaption>
          <blockquote className="b-quote wrap-anywhere">&ldquo;{evidence}&rdquo;</blockquote>
        </figure>
      )}
    </div>
  )
}
