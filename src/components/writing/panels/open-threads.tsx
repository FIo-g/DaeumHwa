'use client'

import Link from 'next/link'
import { useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ThreadEventKind } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { IMPORTANCE_LABEL, THREAD_STATUS_LABEL } from '@/lib/labels'
import { addThreadEventAction } from '@/server/actions/threads'
import { allowedEventKinds } from '@/components/threads/thread-event-form'
import type { WorkspaceApi, WritingData } from '../types'
import { EDITOR_ONLY_NOTE, canEditChapter } from './shared'

type OpenThreadsProps = {
  data: WritingData
  api: WorkspaceApi
}

type QuickKind = Extract<ThreadEventKind, 'planted' | 'developed' | 'resolved'>

const OPEN_STATUSES = ['planned', 'planted', 'developing'] as const

const SUCCESS_MESSAGE: Record<QuickKind, string> = {
  planted: '이 회차에 심었다고 기록했습니다.',
  developed: '이 회차의 발전을 기록했습니다.',
  resolved: '이 회차에서 회수했다고 기록했습니다.',
}

/**
 * Threads still open (planned, planted or developing), with quick ways to record this chapter.
 * Only the kinds the thread's status allows are offered, so each button can succeed. The server
 * still checks every record.
 */
export function OpenThreads({ data, api }: OpenThreadsProps) {
  const editable = canEditChapter(data)
  const [busyId, setBusyId] = useState<string | null>(null)

  const open = data.threads.filter((thread) =>
    (OPEN_STATUSES as readonly string[]).includes(thread.status),
  )

  async function record(threadId: string, kind: QuickKind) {
    setBusyId(threadId)
    const result = await runAction(
      addThreadEventAction({ threadId, kind, chapterId: data.chapter.id }),
      { success: SUCCESS_MESSAGE[kind] },
    )
    setBusyId(null)
    if (result) api.refresh()
  }

  return (
    <section aria-label="열린 떡밥" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">열린 떡밥 {open.length}개</p>
        <Link
          href={`/works/${data.workId}/wiki/threads`}
          className="text-xs underline underline-offset-4"
        >
          떡밥 전체 보기
        </Link>
      </div>

      {open.length === 0 && (
        <EmptyState
          title="열린 떡밥이 없습니다."
          description="떡밥은 위키의 떡밥 목록에서 만듭니다."
        />
      )}

      <ul className="grid gap-2">
        {open.map((thread) => {
          const busy = busyId === thread.id
          const kinds = allowedEventKinds(thread.status)
          // Same rules as addThreadEvent: developed is at or after the planted chapter,
          // resolved strictly after it. A thread that was never planted cannot be developed.
          const planted = thread.plantedPosition
          const developedBlocked = planted === null || data.chapter.position < planted
          const resolvedBlocked = planted === null || data.chapter.position <= planted
          return (
            <li key={thread.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{thread.title}</span>
                {thread.overdue && <Badge variant="destructive">기한 지남</Badge>}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <span>{THREAD_STATUS_LABEL[thread.status]}</span>
                <span>중요도 {IMPORTANCE_LABEL[thread.importance]}</span>
                {thread.plantedPosition !== null && <span>{thread.plantedPosition}화에 심음</span>}
                {thread.targetChapterPosition !== null && (
                  <span>목표 {thread.targetChapterPosition}화</span>
                )}
              </div>
              {editable ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    {kinds.includes('planted') && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void record(thread.id, 'planted')}
                      >
                        이 회차에 심음
                      </Button>
                    )}
                    {kinds.includes('developed') && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || developedBlocked}
                          onClick={() => void record(thread.id, 'developed')}
                        >
                          이 회차에서 발전
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || resolvedBlocked}
                          onClick={() => void record(thread.id, 'resolved')}
                        >
                          이 회차에서 회수
                        </Button>
                      </>
                    )}
                  </div>
                  {kinds.includes('developed') && (
                    <p className="text-xs text-muted-foreground">
                      {planted === null
                        ? '먼저 심은 회차를 기록해야 합니다.'
                        : `회수는 ${planted}화 다음 회차부터 기록할 수 있습니다.`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{EDITOR_ONLY_NOTE}</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
