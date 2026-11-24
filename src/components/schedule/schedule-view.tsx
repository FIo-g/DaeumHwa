'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { CellMeter, CountCell, PopLink, Sheet } from '@/components/motion'
import { Button } from '@/components/ui/button'
import type { ScheduleInput } from '@/db/types'
import { getTextWorker } from '@/lib/client/worker-client'
import { runAction } from '@/lib/client/run-action'
import { addDays, formatKoreanDate } from '@/lib/dates'
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
  alertCount: number
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
export function ScheduleView({
  workId,
  today,
  alertCount,
  canEdit,
  isOwner,
  input,
  items,
}: ScheduleViewProps) {
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
      success: '연재한 회차로 표시했어요.',
    })
    if (saved) router.refresh()
  }

  const bufferCount = bufferChapters.length
  const bufferTarget = input.settings.bufferTarget
  const calculating = result === null
  const nextPublish = result?.slots[0]?.date ?? null
  const deadline = result?.nextDeadline ?? null
  const soon =
    bufferCount > 0 && result?.bufferRunsOutOn && result.bufferRunsOutOn <= addDays(today, 7)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-8">
      <div className="wg-schedule-overview">
        <section aria-label="연재 달력" className="grid min-w-0 grid-cols-1 gap-3">
          <h2 className="b-subhead">연재 달력</h2>
          <MonthCalendar
            month={month}
            today={today}
            slots={result?.slots ?? []}
            items={input.items}
            publishDays={input.settings.publishDays}
            onMonthChange={setMonth}
          />
          <p className="text-sm text-muted-ink">휴재일을 제외한 연재일에 비축 회차를 배정해요.</p>
        </section>

        <div className="wg-schedule-summary">
          <section aria-label="요약">
            <dl className="wg-schedule-ledger">
              <div>
                <dt className="font-medium">비축분</dt>
                <dd className="wg-schedule-stock">
                  <CountCell value={bufferCount} unit="화" className="wg-schedule-stock-count" />
                  {bufferTarget > 0 && (
                    <CellMeter
                      value={bufferCount}
                      max={bufferTarget}
                      cells={bufferTarget}
                      label="비축 목표"
                      className="wg-schedule-meter"
                    />
                  )}
                </dd>
              </div>
              <SummaryRow
                label="다음 연재"
                value={
                  calculating
                    ? '계산 중'
                    : nextPublish
                      ? formatKoreanDate(nextPublish)
                      : '연재 요일 없음'
                }
              />
              <SummaryRow
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
              <SummaryRow
                label="다음 마감"
                value={
                  calculating
                    ? '계산 중'
                    : deadline
                      ? `${deadline.title} D-${deadline.daysLeft}`
                      : '마감 없음'
                }
              />
            </dl>
            {soon && <p className="wg-schedule-warning">비축분이 곧 떨어져요</p>}
          </section>

          {result && result.warnings.length > 0 && (
            <section aria-label="경고" className="wg-schedule-warning grid gap-1">
              {result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </section>
          )}

          {alertCount > 0 && (
            <div>
              <PopLink href={`/works/${workId}#home-alerts`} variant="flat">
                주기 점검 {alertCount}건
              </PopLink>
            </div>
          )}
        </div>
      </div>

      <section aria-label="비축 회차" className="flex flex-col gap-3">
        <h2 className="b-subhead">비축 회차</h2>
        {bufferChapters.length === 0 ? (
          <EmptyState
            title="아직 비축 회차가 없어요."
            description="연재일을 지정하지 않은 완료 회차가 여기에 보여요."
          />
        ) : (
          <ul className="wg-schedule-rows">
            {bufferChapters.map((chapter) => (
              <li key={chapter.id} className="b-row wg-schedule-buffer-row">
                <span className="min-w-0 text-sm wrap-anywhere">
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
        <h2 className="b-subhead">일정 항목</h2>
        {canEdit && (
          <Sheet as="div" className="grid gap-4">
            <p className="font-medium">새 일정</p>
            <ScheduleItemForm workId={workId} today={today} chapters={input.chapters} />
          </Sheet>
        )}
        <ScheduleItemList
          workId={workId}
          items={items}
          chapters={input.chapters}
          canEdit={canEdit}
        />
      </section>

      <section aria-label="연재 설정" className="flex flex-col gap-3">
        <h2 className="b-subhead">연재 설정</h2>
        <Sheet as="div">
          <PublishSettings workId={workId} canEdit={isOwner} settings={input.settings} />
        </Sheet>
      </section>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  )
}
