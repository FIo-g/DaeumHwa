'use client'

import Link from 'next/link'
import { useState } from 'react'
import { FactStatusSelect } from '@/components/app/fact-status-select'
import { Button } from '@/components/ui/button'
import type { FactStatus } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { chapterLabel } from '@/lib/labels'
import type { ProposalPayloadMap } from '@/lib/proposal-payloads'
import { approveProposalAction, rejectProposalAction } from '@/server/actions/proposals'
import type { ProposalView } from '@/server/proposals'
import { ProposalDetails } from './proposal-details'
import { ProposalPayloadEditor } from './proposal-payload-editor'

export type ProposalDecision = 'approved' | 'rejected'

export type ProposalChapterOption = { id: string; position: number; title: string }

type ProposalCardProps = {
  proposal: ProposalView
  workId: string
  chapters: ProposalChapterOption[]
  /** Called after the proposal is approved or rejected, so the list can drop it. */
  onDone?: (id: string) => void
  compact?: boolean
  queueBusy?: boolean
  decision?: ProposalDecision
  onBeginDecision?: () => boolean
  onFinishDecision?: (id: string, decision: ProposalDecision | null) => void
}

/** One proposal: what it would change, its source sentence, and approve / edit / reject. */
export function ProposalCard({
  proposal,
  workId,
  chapters,
  onDone,
  compact = false,
  queueBusy = false,
  decision,
  onBeginDecision,
  onFinishDecision,
}: ProposalCardProps) {
  const isFact = proposal.type === 'fact_create'
  const suggested = (proposal.payload as Partial<ProposalPayloadMap['fact_create']>).suggestedStatus
  const [factStatus, setFactStatus] = useState<FactStatus>(suggested ?? 'undecided')
  const [draft, setDraft] = useState<Record<string, unknown>>(
    proposal.payload && typeof proposal.payload === 'object'
      ? (proposal.payload as Record<string, unknown>)
      : {},
  )
  const [edited, setEdited] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const chapter = proposal.chapterId ? chapters.find((c) => c.id === proposal.chapterId) : undefined
  const chapterText = chapter ? chapterLabel(chapter.position, chapter.title) : null

  function finish(result: boolean, outcome: ProposalDecision) {
    setBusy(false)
    if (onFinishDecision) onFinishDecision(proposal.id, result ? outcome : null)
    else if (result) onDone?.(proposal.id)
  }

  async function approve() {
    if (busy || queueBusy || (onBeginDecision && !onBeginDecision())) return
    setBusy(true)
    const input: {
      proposalId: string
      payloadOverride?: Record<string, unknown>
      factStatus?: FactStatus
    } = { proposalId: proposal.id }
    if (edited) input.payloadOverride = draft
    if (isFact) input.factStatus = factStatus
    const data = await runAction(approveProposalAction(input), { success: '승인했어요.' })
    finish(data != null, 'approved')
  }

  async function reject() {
    if (busy || queueBusy || (onBeginDecision && !onBeginDecision())) return
    setBusy(true)
    const data = await runAction(rejectProposalAction({ proposalId: proposal.id }), {
      success: '거절했어요.',
    })
    finish(data != null, 'rejected')
  }

  return (
    <article
      className="wg-approvals-card"
      data-compact={compact}
      data-decision={decision}
      aria-busy={busy || undefined}
    >
      <ProposalDetails
        proposal={proposal}
        payload={draft}
        compact={compact}
        chapter={
          chapter &&
          chapterText && (
            <Link href={`/works/${workId}/chapters/${chapter.id}`} className="b-link">
              {chapterText}
            </Link>
          )
        }
      />

      {isFact && (
        <div className="wg-approvals-fact grid justify-items-start gap-1.5">
          <p className="text-xs text-muted-foreground">태그</p>
          <FactStatusSelect value={factStatus} onChange={setFactStatus} />
        </div>
      )}

      {editing && (
        <ProposalPayloadEditor
          type={proposal.type}
          payload={draft}
          onChange={(next) => {
            setDraft(next)
            setEdited(true)
          }}
        />
      )}

      <div className="wg-approvals-actions">
        <Button
          size="sm"
          variant="link"
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
          disabled={busy || queueBusy}
        >
          {editing ? '수정 닫기' : '수정'}
        </Button>
        <Button size="sm" variant="outline" onClick={reject} disabled={busy || queueBusy}>
          거절
        </Button>
        <Button size="sm" onClick={approve} disabled={busy || queueBusy}>
          승인
        </Button>
      </div>
    </article>
  )
}
