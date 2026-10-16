'use client'

import { useState } from 'react'
import { FactStatusSelect } from '@/components/app/fact-status-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { FactStatus, IssueRow } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { resolveIssueAction } from '@/server/actions/issues'
import { supersedeFactAction, updateFactAction } from '@/server/actions/wiki'
import type { WritingData } from '../types'

type WikiFixDialogProps = {
  issue: IssueRow
  data: WritingData
  onClose: () => void
  /** Called after the wiki row changed and the issue was marked 'wiki_updated'. */
  onDone: (issueId: string) => void
}

/**
 * Fixes the wiki fact behind a chapter-check issue. "사실 내용 수정" edits the fact in place;
 * "이 회차부터 바뀜" ends the old fact at this chapter and starts a new one.
 */
export function WikiFixDialog({ issue, data, onClose, onDone }: WikiFixDialogProps) {
  const [content, setContent] = useState(issue.wikiExcerpt)
  const [status, setStatus] = useState<FactStatus>('confirmed')
  const [busy, setBusy] = useState(false)
  const factId = issue.factId

  async function finish() {
    const resolved = await runAction(
      resolveIssueAction({ issueId: issue.id, status: 'wiki_updated' }),
    )
    if (resolved) onDone(issue.id)
  }

  async function editFact() {
    if (!factId) return
    setBusy(true)
    const updated = await runAction(updateFactAction({ factId, content }), {
      success: '위키 사실을 고쳤습니다.',
    })
    if (updated) await finish()
    setBusy(false)
  }

  async function supersede() {
    if (!factId) return
    setBusy(true)
    const result = await runAction(
      supersedeFactAction({
        factId,
        fromPosition: data.chapter.position,
        content,
        status,
        sourceChapterId: data.chapter.id,
      }),
      { success: `${data.chapter.position}화부터 바뀐 사실로 기록했습니다.` },
    )
    if (result) await finish()
    setBusy(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) onClose()
  }

  const canSubmit = content.trim().length > 0 && !busy

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>위키 고치기</DialogTitle>
          <DialogDescription>
            지금 위키에 적힌 사실을 고치거나, 이 회차부터 바뀌었다고 기록합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="wiki-fix-content">사실 내용</Label>
          <Textarea
            id="wiki-fix-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={4}
          />
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium">새 사실의 상태 (이 회차부터 바뀜일 때)</p>
          <FactStatusSelect value={status} onChange={setStatus} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void supersede()} disabled={!canSubmit}>
            이 회차부터 바뀜
          </Button>
          <Button onClick={() => void editFact()} disabled={!canSubmit}>
            사실 내용 수정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
