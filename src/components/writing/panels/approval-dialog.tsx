'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/app/empty-state'
import { ProposalCard, type ProposalChapterOption } from '@/components/proposals/proposal-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { runAction } from '@/lib/client/run-action'
import { bulkApproveAction, listProposalsAction } from '@/server/actions/proposals'
import type { ProposalView } from '@/server/proposals'

type ApprovalDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workId: string
  chapterId: string
  chapters: ProposalChapterOption[]
  /** Called after any approval or rejection, so the page can refresh its counts. */
  onChanged: () => void
}

/** Pending wiki proposals from the chapter check. Approve one by one or all at once. */
export function ApprovalDialog(props: ApprovalDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {/* Mounted only while the dialog is open, so the list loads fresh each time. */}
        <ApprovalQueue {...props} />
      </DialogContent>
    </Dialog>
  )
}

function ApprovalQueue({
  workId,
  chapterId,
  chapters,
  onChanged,
}: Omit<ApprovalDialogProps, 'open' | 'onOpenChange'>) {
  const [items, setItems] = useState<ProposalView[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await runAction(listProposalsAction({ workId, chapterId, status: 'pending' }))
      if (!cancelled) setItems(data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [workId, chapterId])

  async function approveAll() {
    if (!items || items.length === 0) return
    setBusy(true)
    const result = await runAction(
      bulkApproveAction({
        workId,
        proposalIds: items.map((item) => item.id),
        useSuggestedStatus: true,
      }),
    )
    if (!result) {
      setBusy(false)
      return
    }
    if (result.failed.length > 0) {
      toast.error(`${result.failed.length}건은 승인하지 못했습니다.`)
    } else {
      toast.success(`${result.approved}건을 승인했습니다.`)
    }
    onChanged()
    const reloaded = await runAction(listProposalsAction({ workId, chapterId, status: 'pending' }))
    setItems(reloaded ?? [])
    setBusy(false)
  }

  function handleDone(id: string) {
    setItems((prev) => (prev ? prev.filter((item) => item.id !== id) : prev))
    onChanged()
  }

  const count = items?.length ?? 0

  return (
    <>
      <DialogHeader>
        <DialogTitle>이 회차에서 찾은 위키 후보 {count}건</DialogTitle>
        <DialogDescription>
          승인하면 위키에 반영됩니다. 거절한 후보는 위키에 들어가지 않습니다.
        </DialogDescription>
      </DialogHeader>

      {items === null && <p className="text-sm text-muted-foreground">불러오는 중…</p>}

      {items !== null && items.length === 0 && (
        <EmptyState title="승인 대기 중인 후보가 없습니다." />
      )}

      {items !== null && items.length > 0 && (
        <div className="grid gap-3">
          {items.map((item) => (
            <ProposalCard
              key={item.id}
              proposal={item}
              workId={workId}
              chapters={chapters}
              compact
              onDone={handleDone}
            />
          ))}
        </div>
      )}

      {count > 0 && (
        <div className="flex justify-end">
          <Button onClick={() => void approveAll()} disabled={busy}>
            모두 승인 (AI 태그 그대로)
          </Button>
        </div>
      )}
    </>
  )
}
