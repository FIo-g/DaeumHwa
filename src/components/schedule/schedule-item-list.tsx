'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmButton } from '@/components/app/confirm-button'
import type { ScheduleKind } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { chapterLabel, SCHEDULE_KIND_LABEL } from '@/lib/labels'
import { formatKoreanDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { deleteScheduleItemAction, setScheduleItemDoneAction } from '@/server/actions/schedule'

export type ScheduleItemView = {
  id: string
  kind: ScheduleKind
  title: string
  date: string
  endDate: string | null
  chapterId: string | null
  note: string
  done: boolean
}

type ScheduleItemListProps = {
  items: ScheduleItemView[]
  chapters: { id: string; position: number; title: string }[]
  canEdit: boolean
}

/** Dates of an item as `10월 12일 (월) ~ 10월 13일 (화)`, or one date when it has no end. */
function itemDateText(item: ScheduleItemView): string {
  if (!item.endDate || item.endDate === item.date) return formatKoreanDate(item.date)
  return `${formatKoreanDate(item.date)} ~ ${formatKoreanDate(item.endDate)}`
}

/** Schedule items in date order. Editors can mark them done or delete them. */
export function ScheduleItemList({ items, chapters, canEdit }: ScheduleItemListProps) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const chapterById = new Map(chapters.map((c) => [c.id, c]))

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">등록된 일정이 없습니다.</p>
  }

  async function toggleDone(itemId: string, done: boolean) {
    setPendingId(itemId)
    try {
      const updated = await runAction(setScheduleItemDoneAction({ itemId, done }))
      if (updated) router.refresh()
    } finally {
      setPendingId(null)
    }
  }

  async function remove(itemId: string) {
    setPendingId(itemId)
    try {
      const removed = await runAction(deleteScheduleItemAction({ itemId }), {
        success: '일정을 삭제했습니다.',
      })
      if (removed !== null) router.refresh()
    } finally {
      setPendingId(null)
    }
  }

  return (
    <ul className="flex flex-col divide-y rounded-xl border" aria-label="일정 목록">
      {items.map((item) => {
        const chapter = item.chapterId ? chapterById.get(item.chapterId) : undefined
        return (
          <li key={item.id} className="flex items-start gap-3 px-4 py-3">
            {canEdit && (
              <Checkbox
                className="mt-1"
                aria-label={`${item.title} 완료`}
                checked={item.done}
                disabled={pendingId === item.id}
                onCheckedChange={(checked) => toggleDone(item.id, checked)}
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{SCHEDULE_KIND_LABEL[item.kind]}</Badge>
                <span
                  className={cn('font-medium', item.done && 'text-muted-foreground line-through')}
                >
                  {item.title}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {itemDateText(item)}
                {chapter && ` · ${chapterLabel(chapter.position, chapter.title)}`}
              </p>
              {item.note && <p className="text-sm whitespace-pre-line">{item.note}</p>}
            </div>
            {canEdit && (
              <ConfirmButton
                title="일정을 삭제할까요?"
                description="삭제한 일정은 되돌릴 수 없습니다."
                confirmLabel="삭제"
                variant="ghost"
                size="sm"
                disabled={pendingId === item.id}
                onConfirm={() => remove(item.id)}
              >
                삭제
              </ConfirmButton>
            )}
          </li>
        )
      })}
    </ul>
  )
}
