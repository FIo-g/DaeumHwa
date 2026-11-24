'use client'

import Link from 'next/link'
import { type CSSProperties, useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { GridTitle } from '@/components/motion'
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
    ...open.flatMap((thread) => [thread.plantedPosition, thread.targetChapterPosition]),
  ].filter((position): position is number => position !== null)
  const first = Math.min(...positions)
  const last = Math.max(...positions)
  const span = Math.max(1, last - first)
  const onAxis = (position: number) => `${((position - first) / span) * 100}%`

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
      <GridTitle>떡밥</GridTitle>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">열린 떡밥 {open.length}개</p>
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
                {thread.plantedPosition !== null && (
                  <span className="font-mono">{thread.plantedPosition}화에 심음</span>
                )}
                {thread.targetChapterPosition !== null && (
                  <span className="font-mono">목표 {thread.targetChapterPosition}화</span>
                )}
              </div>
              <div className="wg-panels-axis" aria-hidden="true">
                <div className="wg-panels-axis-track">
                  <span
                    className="wg-panels-axis-line"
                    data-planned={planted === null}
                    style={{
                      insetInlineStart: onAxis(Math.min(planted ?? first, target ?? last)),
                      insetInlineEnd:
                        target === null
                          ? '0%'
                          : `calc(100% - ${onAxis(Math.max(planted ?? first, target))})`,
                    }}
                  />
                  {target !== null && (
                    <span
                      className="wg-panels-axis-target"
                      style={{ insetInlineStart: onAxis(target) }}
                    />
                  )}
                  {planted !== null && (
                    <span
                      className="wg-panels-axis-seed"
                      style={{ insetInlineStart: onAxis(planted) }}
                    />
                  )}
                </div>
                <span>{first}화</span>
                {last !== first && <span>{last}화</span>}
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
