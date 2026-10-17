'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { Badge } from '@/components/ui/badge'
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
  onOpenChange,
}: ThreadDetailDialogProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  async function archiveThread() {
    const saved = await runAction(archiveThreadAction({ threadId: thread.id }), {
      success: '떡밥을 보관했습니다.',
    })
    if (saved) {
      router.refresh()
      onOpenChange(false)
    }
  }

  async function archiveEvent(eventId: string) {
    const saved = await runAction(archiveThreadEventAction({ eventId }), {
      success: '기록을 보관했습니다.',
    })
    if (saved) router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{thread.title}</DialogTitle>
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
            <p className="whitespace-pre-wrap">{thread.description || '설명이 없습니다.'}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">심은 회차</dt>
              <dd>
                {thread.plantedPosition === null ? '아직 심지 않음' : `${thread.plantedPosition}화`}
              </dd>
              <dt className="text-muted-foreground">회수 목표</dt>
              <dd className="flex items-center gap-2">
                {thread.targetChapterPosition === null
                  ? '정하지 않음'
                  : `${thread.targetChapterPosition}화`}
                {thread.overdue && <Badge variant="destructive">회수 목표 지남</Badge>}
              </dd>
              <dt className="text-muted-foreground">관련 카드</dt>
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
                  description="보관해도 기록은 남고, 장부 목록에서만 사라집니다."
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
          <h3 id="thread-timeline-title" className="text-sm font-medium">
            기록
          </h3>
          {thread.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 기록이 없습니다.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {thread.events.map((event) => (
                <li key={event.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {THREAD_EVENT_LABEL[event.kind]} ·{' '}
                      {event.chapterPosition === null
                        ? '회차 없음'
                        : chapterLabel(event.chapterPosition, event.chapterTitle)}
                    </span>
                    {canEdit && (
                      <ConfirmButton
                        size="sm"
                        title="이 기록을 보관할까요?"
                        description="보관한 기록은 타임라인에서 사라지고, 떡밥 상태는 남은 기록에 맞춰 다시 계산됩니다."
                        confirmLabel="보관"
                        onConfirm={() => archiveEvent(event.id)}
                      >
                        보관
                      </ConfirmButton>
                    )}
                  </div>
                  {event.note && <p className="whitespace-pre-wrap">{event.note}</p>}
                  {event.evidence && (
                    <p className="text-muted-foreground">근거: {event.evidence}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {canEdit && !editing && (
          <section className="flex flex-col gap-3 border-t pt-4" aria-label="기록 추가">
            <h3 className="text-sm font-medium">기록 추가</h3>
            <ThreadEventForm thread={thread} chapters={chapters} />
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}
