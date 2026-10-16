'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ScheduleInput } from '@/db/types'
import { getTextWorker } from '@/lib/client/worker-client'
import { runAction } from '@/lib/client/run-action'
import { formatKoreanDate } from '@/lib/dates'
import { chapterLabel } from '@/lib/labels'
import type { ScheduleResult } from '@/lib/schedule'
import { setChapterPublishedOnAction } from '@/server/actions/chapters'
import { MonthCalendar } from './month-calendar'
import { PublishSettings } from './publish-settings'
import { ScheduleItemForm } from './schedule-item-form'
import { type ScheduleItemView, ScheduleItemList } from './schedule-item-list'

type ScheduleViewProps = {
  workId: string
  /** Today in Seoul as `YYYY-MM-DD`. */
  today: string
  /** Editor role or higher: can change items and mark chapters as published. */
  canEdit: boolean
  /** Owner role: can change publish settings. */
  isOwner: boolean
  /** Settings, chapters and items for the schedule calculation. */
  input: ScheduleInput
  /** Schedule items with all fields, for the list. */
  items: ScheduleItemView[]
}

/** Schedule page body: summary, calendar, buffer chapters, items, and publish settings. */
export function ScheduleView({ workId, today, canEdit, isOwner, input, items }: ScheduleViewProps) {
  const router = useRouter()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [result, setResult] = useState<ScheduleResult | null>(null)

  useEffect(() => {
    let cancelled = false
    getTextWorker()
      .computeSchedule(input, today)
      .then((next) => {
        if (!cancelled) setResult(next)
      })
      .catch(() => {
        if (!cancelled) setResult(null)
      })
    return () => {
      cancelled = true
    }
  }, [input, today])

  const bufferChapters = useMemo(
    () =>
      input.chapters
        .filter((c) => c.status === 'done' && (c.publishedOn === null || c.publishedOn > today))
        .sort((a, b) => a.position - b.position),
    [input.chapters, today],
  )

  async function markPublished(chapterId: string) {
    const saved = await runAction(setChapterPublishedOnAction({ chapterId, publishedOn: today }), {
      success: '연재함으로 표시했습니다.',
    })
    if (saved) router.refresh()
  }

  const bufferCount = bufferChapters.length
  const calculating = result === null
  const nextPublish = result?.slots[0]?.date ?? null
  const deadline = result?.nextDeadline ?? null

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="요약" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="비축분" value={`${bufferCount}화`} />
        <SummaryCard
          label="다음 연재"
          value={
            calculating ? '계산 중' : nextPublish ? formatKoreanDate(nextPublish) : '연재 요일 없음'
          }
        />
        <SummaryCard
          label="비축 소진 예상"
          value={
            calculating
              ? '계산 중'
              : bufferCount === 0
                ? '비축분 없음'
                : result.bufferRunsOutOn
                  ? formatKoreanDate(result.bufferRunsOutOn)
                  : '향후 6주 안에 없음'
          }
        />
        <SummaryCard
          label="다음 마감"
          value={
            calculating
              ? '계산 중'
              : deadline
                ? `${deadline.title} D-${deadline.daysLeft}`
                : '마감 없음'
          }
        />
      </section>

      {result && result.warnings.length > 0 && (
        <section
          aria-label="경고"
          className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {result.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </section>
      )}

      <section aria-label="연재 달력" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">연재 달력</h2>
        <MonthCalendar
          month={month}
          today={today}
          slots={result?.slots ?? []}
          items={input.items}
          onMonthChange={setMonth}
        />
        <p className="text-xs text-muted-foreground">
          예상 연재일입니다. 휴재 기간은 건너뛰고 비축 회차를 차례로 배정합니다.
        </p>
      </section>

      <section aria-label="비축 회차" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">비축 회차</h2>
        {bufferChapters.length === 0 ? (
          <EmptyState title="비축 회차가 없습니다." description="완료한 회차가 여기에 모입니다." />
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {bufferChapters.map((chapter) => (
              <li key={chapter.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate text-sm">
                  {chapterLabel(chapter.position, chapter.title)}
                </span>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => markPublished(chapter.id)}>
                    연재함
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="일정 항목" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">일정 항목</h2>
        {canEdit && (
          <Card>
            <CardHeader>
              <CardTitle>새 일정</CardTitle>
            </CardHeader>
            <CardContent>
              <ScheduleItemForm workId={workId} today={today} chapters={input.chapters} />
            </CardContent>
          </Card>
        )}
        <ScheduleItemList items={items} chapters={input.chapters} canEdit={canEdit} />
      </section>

      <section aria-label="연재 설정" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">연재 설정</h2>
        <Card>
          <CardContent className="pt-4">
            <PublishSettings workId={workId} canEdit={isOwner} settings={input.settings} />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
