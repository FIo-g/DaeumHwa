'use client'

import Link from 'next/link'
import { useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { runAction } from '@/lib/client/run-action'
import { IMPORTANCE_LABEL, THREAD_STATUS_LABEL } from '@/lib/labels'
import { addThreadEventAction } from '@/server/actions/threads'
import type { WorkspaceApi, WritingData } from '../types'
import { EDITOR_ONLY_NOTE, canEditChapter } from './shared'

type OpenThreadsProps = {
  data: WritingData
  api: WorkspaceApi
}

const OPEN_STATUSES = ['planned', 'planted', 'developing'] as const

/** Threads still open (planned, planted or developing), with quick ways to record this chapter. */
export function OpenThreads({ data, api }: OpenThreadsProps) {
  const editable = canEditChapter(data)
  const [busyId, setBusyId] = useState<string | null>(null)

  const open = data.threads.filter((thread) =>
    (OPEN_STATUSES as readonly string[]).includes(thread.status),
  )

  async function record(threadId: string, kind: 'developed' | 'resolved') {
    setBusyId(threadId)
    const result = await runAction(
      addThreadEventAction({ threadId, kind, chapterId: data.chapter.id }),
      {
        success:
          kind === 'developed'
            ? '이 회차의 발전을 기록했습니다.'
            : '이 회차에서 회수했다고 기록했습니다.',
      },
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void record(thread.id, 'developed')}
                  >
                    이 회차에서 발전
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void record(thread.id, 'resolved')}
                  >
                    이 회차에서 회수
                  </Button>
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
