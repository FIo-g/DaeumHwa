'use client'

import Link from 'next/link'
import { type CSSProperties, useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import type { ThreadEventKind } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { IMPORTANCE_LABEL, THREAD_STATUS_LABEL } from '@/lib/labels'
import { addThreadEventAction } from '@/server/actions/threads'
import { allowedEventKinds } from '@/components/threads/thread-event-form'
import { threadChapterCenter } from '@/components/threads/thread-geometry'
import type { WorkspaceApi, WritingData } from '../types'
import { EDITOR_ONLY_NOTE, canEditChapter } from './shared'

type OpenThreadsProps = {
  data: WritingData
  api: WorkspaceApi
}

type QuickKind = Extract<ThreadEventKind, 'planted' | 'developed' | 'resolved'>

const OPEN_STATUSES = ['planned', 'planted', 'developing'] as const

const SUCCESS_MESSAGE: Record<QuickKind, string> = {
  planted: '이 회차에 심었다고 기록했어요.',
  developed: '이 회차의 발전을 기록했어요.',
  resolved: '이 회차에서 회수했다고 기록했어요.',
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

  const positions = [
    data.chapter.position,
    ...data.chapters.map((chapter) => chapter.position),
    ...open.flatMap((thread) => [thread.plantedPosition, thread.targetChapterPosition]),
  ].filter((position): position is number => position !== null)
  const first = Math.min(...positions)
  const last = Math.max(...positions)
  const chapterCount = last - first + 1
  const onAxis = (position: number) =>
    `${threadChapterCenter(position - first + 1, chapterCount, 100)}%`

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
    <section aria-label="열린 떡밥" className="wg-panels-section">
      <h2 className="wg-panels-heading">떡밥</h2>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          열린 떡밥 <span className="font-mono">{open.length}개</span>
        </p>
        <Link
          href={`/works/${data.workId}/wiki/threads`}
          className="text-xs underline underline-offset-4"
        >
          떡밥 장부 보기
        </Link>
      </div>

      {open.length === 0 && (
        <EmptyState title="열린 떡밥이 없어요." description="새 떡밥은 장부에서 추가해 보세요." />
      )}

      <ul className="wg-panels-list">
        {open.map((thread, index) => {
          const busy = busyId === thread.id
          const kinds = allowedEventKinds(thread.status)
          // Same rules as addThreadEvent: developed is at or after the planted chapter,
          // resolved strictly after it. A thread that was never planted cannot be developed.
          const planted = thread.plantedPosition
          const target = thread.targetChapterPosition
          const coincident = planted !== null && planted === target
          const start = Math.min(planted ?? first, target ?? last)
          const end = Math.max(planted ?? first, target ?? last)
          const developedBlocked = planted === null || data.chapter.position < planted
          const resolvedBlocked = planted === null || data.chapter.position <= planted
          return (
            <li
              key={thread.id}
              style={{ '--wg-panels-row': Math.min(index, 3) } as CSSProperties}
              className="wg-panels-row grid gap-2"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="wg-panels-subhead">{thread.title}</span>
                {thread.overdue && <span className="wg-panels-kind">회수 목표 지남</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <span className="b-state" data-mark={planted === null ? 'dash' : 'dot'}>
                  {THREAD_STATUS_LABEL[thread.status]}
                </span>
                <span>중요도 {IMPORTANCE_LABEL[thread.importance]}</span>
                {planted !== null && (
                  <span>
                    <span className="font-mono">{planted}화</span>에 심음
                  </span>
                )}
                {target !== null && (
                  <span>
                    목표 <span className="font-mono">{target}화</span>
                  </span>
                )}
              </div>
              <div className="wg-panels-axis" aria-hidden="true">
                <div
                  className="wg-panels-axis-plot"
                  style={{ '--wg-panels-axis-count': chapterCount } as CSSProperties}
                >
                  <div className="wg-panels-axis-track">
                    {start !== end && (
                      <span
                        className="wg-panels-axis-line"
                        data-planned={planted === null}
                        style={{
                          insetInlineStart: onAxis(start),
                          insetInlineEnd: `calc(100% - ${onAxis(end)})`,
                        }}
                      />
                    )}
                    {planted !== null && (
                      <span
                        className="wg-panels-axis-marker wg-panels-axis-seed"
                        data-thread-coincident={coincident ? 'seed' : undefined}
                        style={{ insetInlineStart: onAxis(planted) }}
                      />
                    )}
                    {target !== null && (
                      <span
                        className="wg-panels-axis-marker wg-panels-axis-target"
                        data-thread-coincident={coincident ? 'target' : undefined}
                        style={{ insetInlineStart: onAxis(target) }}
                      />
                    )}
                  </div>
                  <div className="wg-panels-axis-labels">
                    <span>{first}화</span>
                    {last !== first && <span>{last}화</span>}
                  </div>
                </div>
              </div>
              {editable ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    {kinds.includes('planted') && (
                      <Button
                        size="sm"
                        variant="link"
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
                          variant="link"
                          disabled={busy || developedBlocked}
                          onClick={() => void record(thread.id, 'developed')}
                        >
                          이 회차에서 발전
                        </Button>
                        <Button
                          size="sm"
                          variant="link"
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
                        ? '떡밥을 심은 회차부터 기록해 주세요.'
                        : `회수는 ${planted}화 다음 회차부터 기록할 수 있어요.`}
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
