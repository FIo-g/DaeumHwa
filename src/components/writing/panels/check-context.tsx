'use client'

import Link from 'next/link'
import { useEffect, useState, type JSX } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { runAction } from '@/lib/client/run-action'
import {
  ENTRY_KIND_LABEL,
  FACT_STATUS_LABEL,
  THREAD_STATUS_LABEL,
  chapterLabel,
  factValidityText,
} from '@/lib/labels'
import { getCheckContextAction } from '@/server/actions/checks'
import type { CheckContextView } from '@/server/check-context'

export function CheckContext(props: {
  workId: string
  chapterId: string
  position: number
  /** Changes when a check finishes; an open section reloads then. */
  refreshKey: unknown
}): JSX.Element {
  const { workId, chapterId, position, refreshKey } = props
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<CheckContextView | null>(null)
  const [failed, setFailed] = useState(false)
  // A finished check resets an open section to waiting; the effect below reloads it.
  // The same previous-value pattern as CheckPanel, so no setState lands in an effect.
  const [prevKey, setPrevKey] = useState(refreshKey)
  if (open && refreshKey !== prevKey) {
    setPrevKey(refreshKey)
    setView(null)
    setFailed(false)
  }

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    // Opening always starts from waiting, so reopening reloads too.
    setView(null)
    setFailed(false)
    setOpen(true)
  }

  // An open section loads when it opens, when the check finishes (refreshKey),
  // or when the chapter changes. A closed section never loads. State updates
  // happen only in the async callback, never synchronously in this effect.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void runAction(getCheckContextAction({ chapterId })).then((data) => {
      if (cancelled) return
      if (!data) {
        setView(null)
        setFailed(true)
        return
      }
      setView(data)
    })
    return () => {
      cancelled = true
    }
  }, [open, refreshKey, chapterId])
  const loading = view === null && !failed

  return (
    <div className="grid gap-2">
      <div>
        <Button variant="outline" size="sm" aria-expanded={open} onClick={toggle}>
          {open ? '접기' : 'AI가 참고한 설정 보기'}
        </Button>
      </div>
      {open && (
        <section aria-label="AI가 참고한 설정" className="b-paper grid min-w-0 gap-3 p-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : failed || !view ? (
            <p className="text-sm text-muted-foreground">불러오지 못했어요.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {`회차 점검은 저장된 원고에 나온 카드와 항상 넣기로 정한 카드, ${position}화에 유효한 사실, 열린 떡밥, 앞 회차 요약만 AI에 보내요.`}
              </p>
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold">
                  {`설정 카드 ${view.entries.length}개 (전체 ${view.totalEntries}개 중)`}
                </h3>
                {view.entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    원고에 이름이 나온 설정 카드가 없어요.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {view.entries.map((entry) => (
                      <li key={entry.id} className="grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/works/${workId}/wiki/entries/${entry.id}`}
                            className="text-sm font-medium underline underline-offset-4"
                          >
                            {entry.name}
                          </Link>
                          <Badge variant="outline">{ENTRY_KIND_LABEL[entry.kind]}</Badge>
                        </div>
                        {entry.summary !== '' && (
                          <p className="text-xs text-muted-foreground">{entry.summary}</p>
                        )}
                        <ul className="grid gap-1">
                          {entry.facts.map((fact) => {
                            const validity = factValidityText(
                              fact.validFromPosition,
                              fact.validToPosition,
                            )
                            return (
                              <li
                                key={fact.id}
                                className="flex flex-wrap items-center gap-2 text-sm"
                              >
                                <span className="text-canon">{fact.content}</span>
                                <Badge variant="outline">{FACT_STATUS_LABEL[fact.status]}</Badge>
                                {validity && (
                                  <span className="text-xs text-muted-foreground">{validity}</span>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
                {view.trimmedEntryNames.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {`분량 한도로 빠진 카드: ${view.trimmedEntryNames.join(', ')}`}
                  </p>
                )}
              </div>
              {view.threads.length > 0 && (
                <div className="grid gap-2">
                  <h3 className="text-sm font-semibold">{`열린 떡밥 ${view.threads.length}개`}</h3>
                  <ul className="grid gap-1">
                    {view.threads.map((thread) => (
                      <li key={thread.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{thread.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {THREAD_STATUS_LABEL[thread.status]}
                        </span>
                        {thread.targetPosition !== null && (
                          <span className="text-xs text-muted-foreground">
                            {`회수 목표 ${thread.targetPosition}화`}
                          </span>
                        )}
                        {thread.overdue && <Badge variant="secondary">회수 목표 지남</Badge>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {view.previousSummaries.length > 0 && (
                <div className="grid gap-1">
                  <h3 className="text-sm font-semibold">앞 회차 요약</h3>
                  <ul className="grid gap-1">
                    {view.previousSummaries.map((summary) => (
                      <li key={summary.position} className="text-sm">
                        {chapterLabel(summary.position, summary.title)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(view.relationCount > 0 || view.namingRuleCount > 0) && (
                <p className="text-xs text-muted-foreground">
                  {`관계 ${view.relationCount}개, 이름 규칙 ${view.namingRuleCount}개도 보내요.`}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
