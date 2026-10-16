import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import type { PeriodicAlerts } from '@/server/alerts'
import type { WorkHome } from '@/server/dashboard'
import { formatKoreanDate, formatKoreanDateTime } from '@/lib/dates'
import { THREAD_STATUS_LABEL } from '@/lib/labels'

export type HomePanelsProps = {
  workId: string
  pendingCount: number
  openThreads: WorkHome['openThreads']
  alerts: PeriodicAlerts
  schedule: WorkHome['schedule']
  recentChanges: { id: string; summary: string; createdAt: Date }[]
}

/** The five panels of the work home: approvals, open threads, periodic checks, schedule, changes. */
export function HomePanels({
  workId,
  pendingCount,
  openThreads,
  alerts,
  schedule,
  recentChanges,
}: HomePanelsProps) {
  const base = `/works/${workId}`
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel id="home-approvals" title="승인 대기">
        <p>
          <span className="text-2xl font-semibold">{pendingCount}건</span>
          <span className="text-muted-foreground"> 대기 중</span>
        </p>
        <LinkButton href={`${base}/approvals`} label="승인 대기 보기" />
      </Panel>

      <Panel id="home-threads" title="열린 떡밥">
        {openThreads.length === 0 ? (
          <p className="text-sm text-muted-foreground">열린 떡밥이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {openThreads.slice(0, 5).map((thread) => (
              <li key={thread.id} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{thread.title}</span>
                  <Badge variant="outline">{THREAD_STATUS_LABEL[thread.status]}</Badge>
                  {thread.overdue && <span className="text-destructive">회수 목표 지남</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {thread.plantedPosition !== null && `${thread.plantedPosition}화 심음`}
                  {thread.targetPosition !== null && ` · 회수 목표 ${thread.targetPosition}화`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <LinkButton href={`${base}/wiki/threads`} label="떡밥 장부 보기" />
      </Panel>

      <Panel id="home-alerts" title="주기 점검">
        <AlertList alerts={alerts} />
      </Panel>

      <Panel id="home-schedule" title="일정">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">비축</dt>
          <dd>{schedule.bufferCount}화</dd>
          <dt className="text-muted-foreground">다음 연재일</dt>
          <dd>
            {schedule.nextPublishDate
              ? formatKoreanDate(schedule.nextPublishDate)
              : '정해지지 않음'}
          </dd>
          <dt className="text-muted-foreground">소진 예상일</dt>
          <dd>{schedule.bufferRunsOutOn ? formatKoreanDate(schedule.bufferRunsOutOn) : '없음'}</dd>
          <dt className="text-muted-foreground">다음 마감</dt>
          <dd>
            {schedule.nextDeadline
              ? `${schedule.nextDeadline.title} · ${formatKoreanDate(schedule.nextDeadline.date)} (${
                  schedule.nextDeadline.daysLeft === 0
                    ? '오늘'
                    : `D-${schedule.nextDeadline.daysLeft}`
                })`
              : '없음'}
          </dd>
        </dl>
        <LinkButton href={`${base}/schedule`} label="일정 보기" />
      </Panel>

      <Panel id="home-changes" title="최근 변경">
        {recentChanges.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 변경 이력이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {recentChanges.map((change) => (
              <li key={change.id} className="flex flex-col gap-0.5">
                <span>{change.summary}</span>
                <span className="text-xs text-muted-foreground">
                  {formatKoreanDateTime(change.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <LinkButton href={`${base}/history`} label="이력 보기" />
      </Panel>
    </div>
  )
}

function AlertList({ alerts }: { alerts: PeriodicAlerts }) {
  const messages: string[] = [
    ...alerts.overdueThreads.map(
      (t) =>
        `‘${t.title}’ 회수 목표 ${t.targetPosition}화가 지났습니다 (현재 ${t.latestPosition}화).`,
    ),
    ...alerts.absentCharacters.map(
      (c) => `‘${c.name}’이(가) ${c.chaptersSince}화째 등장하지 않았습니다.`,
    ),
    ...(alerts.stalePendingCount > 0
      ? [`7일 넘게 기다리는 제안이 ${alerts.stalePendingCount}건 있습니다.`]
      : []),
    ...(alerts.bufferWarning ? [alerts.bufferWarning] : []),
  ]
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">지금 확인할 항목이 없습니다.</p>
  }
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  )
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <div>
      <Link href={href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        {label}
      </Link>
    </div>
  )
}
