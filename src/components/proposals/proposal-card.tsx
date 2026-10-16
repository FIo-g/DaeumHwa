'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AiBadge } from '@/components/app/ai-badge'
import { FactStatusSelect } from '@/components/app/fact-status-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { FactStatus } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { chapterLabel, PROPOSAL_SOURCE_LABEL, PROPOSAL_TYPE_LABEL } from '@/lib/labels'
import type { ProposalPayloadMap } from '@/lib/proposal-payloads'
import { approveProposalAction, rejectProposalAction } from '@/server/actions/proposals'
import type { ProposalView } from '@/server/proposals'
import { evidenceOf, summarizeProposal } from './proposal-summary'
import { ProposalPayloadEditor } from './proposal-payload-editor'

export type ProposalChapterOption = { id: string; position: number; title: string }

type ProposalCardProps = {
  proposal: ProposalView
  workId: string
  chapters: ProposalChapterOption[]
  /** Called after the proposal is approved or rejected, so the list can drop it. */
  onDone?: (id: string) => void
  compact?: boolean
}

/** One proposal: what it would change, its source sentence, and approve / edit / reject. */
export function ProposalCard({
  proposal,
  workId,
  chapters,
  onDone,
  compact = false,
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
  const summary = summarizeProposal(proposal.type, draft)
  const evidence = evidenceOf(proposal.type, draft)

  async function approve() {
    setBusy(true)
    const input: {
      proposalId: string
      payloadOverride?: Record<string, unknown>
      factStatus?: FactStatus
    } = { proposalId: proposal.id }
    if (edited) input.payloadOverride = draft
    if (isFact) input.factStatus = factStatus
    const data = await runAction(approveProposalAction(input), { success: '승인했습니다.' })
    setBusy(false)
    if (data) onDone?.(proposal.id)
  }

  async function reject() {
    setBusy(true)
    const data = await runAction(rejectProposalAction({ proposalId: proposal.id }), {
      success: '거절했습니다.',
    })
    setBusy(false)
    if (data) onDone?.(proposal.id)
  }

  return (
    <article
      className={compact ? 'grid gap-2 rounded-lg border p-3' : 'grid gap-3 rounded-xl border p-4'}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <AiBadge />
        <Badge variant="outline">{PROPOSAL_TYPE_LABEL[proposal.type]}</Badge>
        <span>{PROPOSAL_SOURCE_LABEL[proposal.source]}</span>
        {chapter && chapterText && (
          <Link
            href={`/works/${workId}/chapters/${chapter.id}`}
            className="underline underline-offset-4"
          >
            {chapterText}
          </Link>
        )}
      </div>

      <div className="grid gap-1">
        <p className="font-medium">{summary.headline}</p>
        {summary.detail && <p className="text-sm text-muted-foreground">{summary.detail}</p>}
      </div>

      {!compact && evidence && (
        <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
          &ldquo;{evidence}&rdquo;
        </blockquote>
      )}

      {isFact && (
        <div className="grid gap-1.5">
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

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
        >
          {editing ? '수정 닫기' : '수정'}
        </Button>
        <Button size="sm" variant="outline" onClick={reject} disabled={busy}>
          거절
        </Button>
        <Button size="sm" onClick={approve} disabled={busy}>
          승인
        </Button>
      </div>
    </article>
  )
}
