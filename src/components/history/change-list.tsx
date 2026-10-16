'use client'

import { useState } from 'react'
import { AiBadge } from '@/components/app/ai-badge'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import type { ChangeRow, ChangeTargetTable, ProposerType } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { formatKoreanDateTime } from '@/lib/dates'
import { listChangesAction, revertChangeAction } from '@/server/actions/history'
import { ChangeDiff } from './change-diff'
import { CHANGE_TARGET_LABEL, HISTORY_PAGE_SIZE } from './history-config'

export type ChangeView = ChangeRow & { actorName: string | null }

type ChangeListProps = {
  workId: string
  initialRows: ChangeView[]
  targetTable?: ChangeTargetTable
  proposerType?: ProposerType
  /** Editor role or higher: shows the revert button. */
  canEdit: boolean
}

/** Change history rows with expandable before/after diffs, revert, and "더 보기" paging. */
export function ChangeList({
  workId,
  initialRows,
  targetTable,
  proposerType,
  canEdit,
}: ChangeListProps) {
  const [rows, setRows] = useState<ChangeView[]>(initialRows)
  const [hasMore, setHasMore] = useState(initialRows.length >= HISTORY_PAGE_SIZE)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function loadMore() {
    const last = rows[rows.length - 1]
    if (!last || busy) return
    setBusy(true)
    const data = await runAction(
      listChangesAction({
        workId,
        targetTable,
        proposerType,
        beforeCreatedAt: new Date(last.createdAt).toISOString(),
      }),
    )
    setBusy(false)
    if (!data) return
    setRows((prev) => [...prev, ...data])
    setHasMore(data.length >= HISTORY_PAGE_SIZE)
  }

  async function revert(changeId: string) {
    const reverted = await runAction(revertChangeAction({ changeId }), {
      success: '되돌렸습니다.',
    })
    if (!reverted) return
    // Reloads the first page so the new 'revert' entry appears at the top.
    const first = await runAction(listChangesAction({ workId, targetTable, proposerType }))
    if (!first) return
    setRows(first)
    setHasMore(first.length >= HISTORY_PAGE_SIZE)
  }

  if (rows.length === 0) {
    return <EmptyState title="변경 이력이 없습니다." />
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-3">
        {rows.map((row) => {
          const open = expanded.has(row.id)
          const panelId = `change-diff-${row.id}`
          return (
            <li key={row.id} className="grid gap-2 rounded-lg border p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <time dateTime={new Date(row.createdAt).toISOString()}>
                  {formatKoreanDateTime(row.createdAt)}
                </time>
                <span>{CHANGE_TARGET_LABEL[row.targetTable]}</span>
                {row.proposerType === 'ai' && <AiBadge />}
                {row.proposerType === 'ai' && <span>승인</span>}
                <span>{row.actorName ?? '알 수 없음'}</span>
              </div>
              <p className="font-medium break-words">{row.summary}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggle(row.id)}
                >
                  {open ? '접기' : '자세히 보기'}
                </Button>
                {canEdit && (
                  <ConfirmButton
                    size="sm"
                    title="이 변경을 되돌릴까요?"
                    description="되돌리기는 새 이력으로 남습니다."
                    confirmLabel="되돌리기"
                    onConfirm={() => revert(row.id)}
                  >
                    되돌리기
                  </ConfirmButton>
                )}
              </div>
              {open && (
                <div id={panelId} className="border-t pt-3">
                  <ChangeDiff targetTable={row.targetTable} before={row.before} after={row.after} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {hasMore && (
        <div>
          <Button variant="outline" onClick={loadMore} disabled={busy}>
            더 보기
          </Button>
        </div>
      )}
    </div>
  )
}
