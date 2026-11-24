'use client'

import { useState, type CSSProperties } from 'react'
import { AiBadge } from '@/components/app/ai-badge'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { Disclosure, Reveal } from '@/components/motion'
import { Button } from '@/components/ui/button'
import type { ChangeRow, ChangeTargetTable, ProposerType } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { formatKoreanDateTime, seoulToday } from '@/lib/dates'
import { listChangesAction, revertChangeAction } from '@/server/actions/history'
import { ChangeDiff } from './change-diff'
import { CHANGE_TARGET_LABEL, HISTORY_PAGE_SIZE } from './history-config'

/** A change row as the history list receives it. `revertable` is false once a later change exists. */
export type ChangeView = ChangeRow & { actorName: string | null; revertable: boolean }

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
  const [busy, setBusy] = useState(false)

  async function loadMore() {
    const last = rows[rows.length - 1]
    if (!last || busy) return
    setBusy(true)
    const data = await runAction(
      listChangesAction({
        workId,
        targetTable,
        proposerType,
        beforeId: last.id,
      }),
    )
    setBusy(false)
    if (!data) return
    setRows((prev) => [...prev, ...data])
    setHasMore(data.length >= HISTORY_PAGE_SIZE)
  }

  async function revert(changeId: string) {
    const reverted = await runAction(revertChangeAction({ changeId }), {
      success: '되돌렸어요.',
    })
    if (!reverted) return
    // Reloads the first page so the new 'revert' entry appears at the top.
    const first = await runAction(listChangesAction({ workId, targetTable, proposerType }))
    if (!first) return
    setRows(first)
    setHasMore(first.length >= HISTORY_PAGE_SIZE)
  }

  if (rows.length === 0) {
    return <EmptyState title="변경 이력이 없어요." />
  }

  const groups = new Map<string, ChangeView[]>()
  for (const row of rows) {
    const day = seoulToday(new Date(row.createdAt))
    const group = groups.get(day)
    if (group) group.push(row)
    else groups.set(day, [row])
  }

  return (
    <div className="grid gap-4">
      <Reveal effectOnly className="b-works-timeline">
        {[...groups].map(([day, entries]) => {
          const [year, month, date] = day.split('-').map(Number)
          return (
            <section key={day} aria-labelledby={`history-${day}`} className="b-works-history-day">
              <h2 id={`history-${day}`} className="b-works-history-date">
                <time dateTime={day}>
                  {year}년 {month}월 {date}일
                </time>
              </h2>
              <ul className="b-works-history-entries">
                {entries.map((row, index) => (
                  <Reveal
                    as="li"
                    delay={70 * Math.min(index, 5)}
                    key={row.id}
                    className="b-works-history-row"
                    style={{ '--b-i': Math.min(index, 5) } as CSSProperties}
                  >
                    <ChangeEntry row={row} canEdit={canEdit} onRevert={revert} />
                  </Reveal>
                ))}
              </ul>
            </section>
          )
        })}
      </Reveal>
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

function ChangeEntry({
  row,
  canEdit,
  onRevert,
}: {
  row: ChangeView
  canEdit: boolean
  onRevert: (id: string) => Promise<void>
}) {
  const [detail, setDetail] = useState<'unopened' | 'open' | 'closed'>('unopened')
  return (
    <article className="b-works-change">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-ink">
        <time dateTime={new Date(row.createdAt).toISOString()}>
          {formatKoreanDateTime(row.createdAt)}
        </time>
        <span className="b-works-tag bg-sand">{CHANGE_TARGET_LABEL[row.targetTable]}</span>
        {row.proposerType === 'ai' && <AiBadge />}
        {row.proposerType === 'ai' && <span>승인</span>}
        <span>{row.actorName ?? '알 수 없음'}</span>
      </div>
      <p className="b-row__title wrap-anywhere">{row.summary}</p>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmButton
            size="sm"
            title="이 변경을 되돌릴까요?"
            description="되돌리기는 새 이력으로 남아요."
            confirmLabel="되돌리기"
            disabled={!row.revertable}
            onConfirm={() => onRevert(row.id)}
          >
            되돌리기
          </ConfirmButton>
          {!row.revertable && (
            <span className="b-label text-muted-ink">이후 변경이 있어 되돌릴 수 없어요.</span>
          )}
        </div>
      )}
      <Disclosure
        title={detail === 'open' ? '접기' : '자세히 보기'}
        open={detail === 'open'}
        onOpenChange={(open) => setDetail(open ? 'open' : 'closed')}
      >
        {detail !== 'unopened' && (
          <div className="b-works-change-diff">
            <ChangeDiff targetTable={row.targetTable} before={row.before} after={row.after} />
          </div>
        )}
      </Disclosure>
    </article>
  )
}
