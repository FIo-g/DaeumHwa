'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ScheduleKind } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { chapterLabel, SCHEDULE_KIND_LABEL } from '@/lib/labels'
import { formatKoreanDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { deleteScheduleItemAction, setScheduleItemDoneAction } from '@/server/actions/schedule'
import { ScheduleItemForm } from './schedule-item-form'

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
  workId: string
  items: ScheduleItemView[]
  chapters: { id: string; position: number; title: string }[]
  canEdit: boolean
}

/** Dates of an item as `10월 12일 (월) ~ 10월 13일 (화)`, or one date when it has no end. */
function itemDateText(item: ScheduleItemView): string {
  if (!item.endDate || item.endDate === item.date) return formatKoreanDate(item.date)
  return `${formatKoreanDate(item.date)} ~ ${formatKoreanDate(item.endDate)}`
}

/** Dialog that edits one schedule item, opened from the list. */
function ScheduleItemEditDialog({
  workId,
  item,
  chapters,
}: {
  workId: string
  item: ScheduleItemView
  chapters: { id: string; position: number; title: string }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>수정</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>일정 수정</DialogTitle>
        </DialogHeader>
        <ScheduleItemForm
          workId={workId}
          today={item.date}
          chapters={chapters}
          item={item}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Schedule items in date order. Editors can mark them done, edit them, or delete them. */
export function ScheduleItemList({ workId, items, chapters, canEdit }: ScheduleItemListProps) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const chapterById = new Map(chapters.map((c) => [c.id, c]))

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 등록한 일정이 없어요.</p>
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
        success: '일정을 삭제했어요.',
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
          <li key={item.id} className="b-tools-index-row flex flex-wrap items-start gap-3 p-3">
            {canEdit && (
              <Checkbox
                className="mt-1"
                aria-label={`${item.title} 완료`}
                checked={item.done}
                disabled={pendingId === item.id}
                onCheckedChange={(checked) => toggleDone(item.id, checked)}
              />
            )}
            <div className="flex min-w-0 flex-1 basis-36 flex-col gap-1 wrap-anywhere">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{SCHEDULE_KIND_LABEL[item.kind]}</Badge>
                <span
                  className={cn('b-row__title', item.done && 'text-muted-foreground line-through')}
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
              <div className="flex items-center gap-1">
                <ScheduleItemEditDialog workId={workId} item={item} chapters={chapters} />
                <ConfirmButton
                  title="일정을 삭제할까요?"
                  description="삭제한 일정은 되돌릴 수 없어요."
                  confirmLabel="삭제"
                  variant="outline"
                  size="sm"
                  disabled={pendingId === item.id}
                  onConfirm={() => remove(item.id)}
                >
                  삭제
                </ConfirmButton>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
