'use client'

import { useRouter } from 'next/navigation'
import { useState, type RefObject } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { runAction } from '@/lib/client/run-action'
import {
  chapterLabel,
  IMPORTANCE_LABEL,
  THREAD_EVENT_LABEL,
  THREAD_STATUS_LABEL,
} from '@/lib/labels'
import { archiveThreadAction, archiveThreadEventAction } from '@/server/actions/threads'
import { ThreadEventForm } from './thread-event-form'
import { ThreadForm } from './thread-form'
import type { ChapterOption, EntryOption, ThreadItem } from './thread-types'

type ThreadDetailDialogProps = {
  workId: string
  thread: ThreadItem
  chapters: ChapterOption[]
  entries: EntryOption[]
  canEdit: boolean
  finalFocus?: RefObject<HTMLButtonElement | null>
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Thread details, its timeline of records, and (for editors) edit, archive and record actions. */
export function ThreadDetailDialog({
  workId,
  thread,
  chapters,
  entries,
  canEdit,
  open,
  finalFocus,
  onOpenChange,
}: ThreadDetailDialogProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  async function archiveThread() {
    const saved = await runAction(archiveThreadAction({ threadId: thread.id }), {
      success: '떡밥을 보관했어요.',
    })
    if (saved) {
      router.refresh()
      onOpenChange(false)
    }
  }

  async function archiveEvent(eventId: string) {
    const saved = await runAction(archiveThreadEventAction({ eventId }), {
      success: '기록을 보관했어요.',
    })
    if (saved) router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent finalFocus={finalFocus} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="wrap-anywhere">{thread.title}</DialogTitle>
          <DialogDescription>
            {THREAD_STATUS_LABEL[thread.status]} · 중요도 {IMPORTANCE_LABEL[thread.importance]}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <ThreadForm
            workId={workId}
            chapters={chapters}
            entries={entries}
            thread={thread}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <section className="flex flex-col gap-3 text-sm" aria-label="떡밥 정보">
            <p className="wrap-anywhere whitespace-pre-wrap">
              {thread.description || '설명이 없어요.'}
            </p>
            <dl className="wg-threads-info grid grid-cols-[max-content_minmax(0,1fr)]">
              <dt className="pr-3 text-muted-ink">심은 회차</dt>
              <dd className="font-mono">
                {thread.plantedPosition === null ? '아직 심지 않음' : `${thread.plantedPosition}화`}
              </dd>
              <dt className="pr-3 text-muted-ink">회수 목표</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2 font-mono">
                {thread.targetChapterPosition === null
                  ? '정하지 않음'
                  : `${thread.targetChapterPosition}화`}
                {thread.overdue && (
                  <span className="wg-threads-overdue font-sans">회수 목표 지남</span>
                )}
              </dd>
              <dt className="pr-3 text-muted-ink">관련 카드</dt>
              <dd>
                {thread.relatedEntries.length === 0
                  ? '없음'
                  : thread.relatedEntries.map((e) => e.name).join(', ')}
              </dd>
            </dl>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  수정
                </Button>
                <ConfirmButton
                  size="sm"
                  title="떡밥을 보관할까요?"
                  description="기록은 남아요. 장부 목록에서만 빠져요."
                  confirmLabel="보관"
                  onConfirm={archiveThread}
                >
                  보관
                </ConfirmButton>
              </div>
            )}
          </section>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="thread-timeline-title">
          <h3 id="thread-timeline-title" className="font-heading text-base font-bold">
            기록
          </h3>
          {thread.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 기록이 없어요.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {thread.events.map((event) => (
                <li key={event.id} className="wg-threads-record flex flex-col gap-1 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium wrap-anywhere">
                      {THREAD_EVENT_LABEL[event.kind]} ·{' '}
                      {event.chapterPosition === null ? (
                        '회차 없음'
                      ) : (
                        <span className="font-mono">
                          {chapterLabel(event.chapterPosition, event.chapterTitle)}
                        </span>
                      )}
                    </span>
                    {canEdit && (
                      <ConfirmButton
                        size="sm"
                        title="이 기록을 보관할까요?"
                        description="타임라인에서 빠져요. 떡밥 상태는 남은 기록으로 다시 계산해요."
                        confirmLabel="보관"
                        onConfirm={() => archiveEvent(event.id)}
                      >
                        보관
                      </ConfirmButton>
                    )}
                  </div>
                  {event.note && <p className="wrap-anywhere whitespace-pre-wrap">{event.note}</p>}
                  {event.evidence && (
                    <p className="text-muted-ink wrap-anywhere">근거: {event.evidence}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {canEdit && !editing && (
          <section className="wg-threads-record-form flex flex-col gap-3" aria-label="기록 추가">
            <h3 className="font-heading text-base font-bold">기록 추가</h3>
            <ThreadEventForm thread={thread} chapters={chapters} />
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}
