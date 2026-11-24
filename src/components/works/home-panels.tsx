import { ArrowUpRightIcon, CalendarDaysIcon, FileCheck2Icon } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { CardRail, HandNote, PopLink, Reveal } from '@/components/motion'
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

export function HomePanels({
  workId,
  pendingCount,
  openThreads,
  alerts,
  schedule,
  recentChanges,
}: HomePanelsProps) {
  const base = `/works/${workId}`
  const threads = openThreads.slice(0, 5)
  const positions = threads.flatMap((thread) => [thread.plantedPosition, thread.targetPosition])
  const lastPosition = Math.max(1, ...positions.filter((position) => position !== null))

  return (
    <div className="b-works-home-panels">
      <Panel name="approvals" number={1} title="승인 대기">
        <div className="b-works-approval-total">
          <p>
            <PanelCount count={pendingCount} unit="건" />
            <span className="b-label block">승인을 기다리는 제안</span>
          </p>
          <span className="b-works-approval-paper b-piece" aria-hidden="true">
            <FileCheck2Icon size={48} strokeWidth={1.3} />
          </span>
        </div>
        <div>
          <PopLink href={`${base}/approvals`} variant="flat">
            승인 대기 보기
          </PopLink>
        </div>
      </Panel>

      <Panel name="threads" number={2} title="열린 떡밥">
        {threads.length === 0 ? (
          <p className="b-label text-muted-ink">열린 떡밥이 없어요.</p>
        ) : threads.length === 1 ? (
          <ThreadPreview thread={threads[0]} lastPosition={lastPosition} />
        ) : (
          <CardRail label="열린 떡밥 미리 보기" className="b-works-thread-rail">
            {threads.map((thread) => (
              <ThreadPreview key={thread.id} thread={thread} lastPosition={lastPosition} />
            ))}
          </CardRail>
        )}
        <PanelLink href={`${base}/wiki/threads`}>떡밥 장부 보기</PanelLink>
      </Panel>

      <Panel name="alerts" number={3} title="주기 점검">
        <div className="b-works-alert-body">
          <PanelCount count={alerts.total} unit="건" />
          <AlertList alerts={alerts} />
        </div>
      </Panel>

      <Panel name="schedule" number={4} title="일정">
        <dl className="b-works-schedule">
          <div>
            <dt>비축</dt>
            <dd>
              <PanelCount count={schedule.bufferCount} unit="화" compact />
            </dd>
          </div>
          <div>
            <dt>다음 연재일</dt>
            <dd>
              {schedule.nextPublishDate
                ? formatKoreanDate(schedule.nextPublishDate)
                : '정해지지 않음'}
            </dd>
          </div>
          <div>
            <dt>소진 예상일</dt>
            <dd>
              {schedule.bufferRunsOutOn ? formatKoreanDate(schedule.bufferRunsOutOn) : '없음'}
            </dd>
          </div>
          <div>
            <dt>다음 마감</dt>
            <dd>
              {schedule.nextDeadline
                ? `${schedule.nextDeadline.title} · ${formatKoreanDate(schedule.nextDeadline.date)} (${
                    schedule.nextDeadline.daysLeft === 0
                      ? '오늘'
                      : `D-${schedule.nextDeadline.daysLeft}`
                  })`
                : '없음'}
            </dd>
          </div>
        </dl>
        {schedule.nextPublishDate && (
          <Reveal effectOnly className="b-works-schedule-track" aria-hidden="true">
            <span className="b-works-axis-fill" />
            <CalendarDaysIcon size={24} />
          </Reveal>
        )}
        <PanelLink href={`${base}/schedule`}>일정 보기</PanelLink>
      </Panel>

      <Panel name="changes" number={5} title="최근 변경">
        {recentChanges.length === 0 ? (
          <p className="b-label text-muted-ink">아직 변경 이력이 없어요.</p>
        ) : (
          <ul className="b-works-recent">
            {recentChanges.map((change, index) => (
              <li key={change.id}>
                <Reveal
                  className="b-works-recent-row"
                  direction="right"
                  style={{ '--b-reveal-x': '-8px' } as CSSProperties}
                  delay={70 * Math.min(index, 5)}
                >
                  <span className="b-dot" aria-hidden="true" />
                  <div>
                    <p>{change.summary}</p>
                    <time
                      className="b-label text-muted-ink"
                      dateTime={change.createdAt.toISOString()}
                    >
                      {formatKoreanDateTime(change.createdAt)}
                    </time>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        )}
        <PanelLink href={`${base}/history`}>이력 보기</PanelLink>
      </Panel>
    </div>
  )
}

function ThreadPreview({
  thread,
  lastPosition,
}: {
  thread: WorkHome['openThreads'][number]
  lastPosition: number
}) {
  const planted = thread.plantedPosition
  const target = thread.targetPosition
  const x = (position: number) => ((position - 1) / Math.max(1, lastPosition - 1)) * 100
  const sameChapter = planted !== null && planted === target
  const plantedX = planted === null ? '0%' : `${x(planted)}%`
  const targetX = target === null ? plantedX : `${x(target)}%`
  const start = sameChapter
    ? `calc(${plantedX} - 8px)`
    : planted === null && target === 1
      ? '-12px'
      : plantedX
  const end = sameChapter ? `calc(${targetX} + 8px)` : targetX
  const reverse = planted !== null && target !== null && planted > target

  return (
    <Reveal as="article" effectOnly className="b-works-thread">
      <header className="grid gap-2">
        <h3 className="b-row__title wrap-anywhere">{thread.title}</h3>
        <div className="flex flex-wrap gap-2">
          <span className="b-works-tag">{THREAD_STATUS_LABEL[thread.status]}</span>
          {thread.overdue && <span className="b-works-tag bg-cream">회수 목표 지남</span>}
        </div>
      </header>
      {(planted !== null || target !== null) && (
        <>
          <div className="b-works-thread-axis" aria-hidden="true">
            <span
              className="b-works-axis-fill"
              data-planned={planted === null}
              style={{
                insetInlineStart: reverse ? end : start,
                insetInlineEnd: `calc(100% - ${reverse ? start : end})`,
              }}
            />
            {planted !== null && (
              <span
                className="b-works-thread-dot b-works-planted"
                style={{ insetInlineStart: start }}
              />
            )}
            {target !== null && (
              <span
                className="b-works-thread-dot b-works-target"
                style={{ insetInlineStart: end }}
              />
            )}
          </div>
          <p className="b-label flex flex-wrap justify-between gap-2">
            {planted !== null && <span>{planted}화 심음</span>}
            {target !== null && <span>회수 목표 {target}화</span>}
          </p>
        </>
      )}
    </Reveal>
  )
}

function AlertList({ alerts }: { alerts: PeriodicAlerts }) {
  const messages = [
    ...alerts.overdueThreads.map(
      (t) =>
        `‘${t.title}’ 회수 목표 ${t.targetPosition}화가 지났어요 (현재 ${t.latestPosition}화).`,
    ),
    ...alerts.absentCharacters.map(
      (c) => `‘${c.name}’이(가) ${c.chaptersSince}화째 등장하지 않았어요.`,
    ),
    ...(alerts.stalePendingCount > 0
      ? [`7일 넘게 기다리는 제안이 ${alerts.stalePendingCount}건 있어요.`]
      : []),
    ...(alerts.bufferWarning ? [alerts.bufferWarning] : []),
  ]
  if (messages.length === 0) {
    return <HandNote>지금 확인할 항목이 없어요.</HandNote>
  }
  return (
    <ul className="b-works-notes">
      {messages.map((message, index) => (
        <li key={message}>
          <HandNote delay={70 * Math.min(index, 5)}>{message}</HandNote>
        </li>
      ))}
    </ul>
  )
}

function Panel({
  name,
  number,
  title,
  children,
}: {
  name: string
  number: number
  title: string
  children: ReactNode
}) {
  const id = `home-${name}`
  return (
    <section
      aria-labelledby={id}
      className="b-works-panel"
      data-panel={name}
      style={{ '--b-i': number - 1 } as CSSProperties}
    >
      <header className="b-works-panel-head">
        <span className="b-number" aria-hidden="true">
          {number}
        </span>
        <h2 id={id} className="b-heading">
          {title}
        </h2>
      </header>
      {children}
    </section>
  )
}

function PanelCount({
  count,
  unit,
  compact = false,
}: {
  count: number
  unit: string
  compact?: boolean
}) {
  return (
    <span
      className="b-works-panel-count"
      data-compact={compact}
      style={{ '--b-works-count-target': count } as CSSProperties}
    >
      <span className="b-works-panel-count-value">
        {count}
        {unit}
      </span>
      <span className="b-works-panel-count-ink" aria-hidden="true">
        {unit}
      </span>
    </span>
  )
}

function PanelLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="b-link b-works-panel-link">
      <span>{children}</span>
      <ArrowUpRightIcon size={18} aria-hidden="true" />
    </Link>
  )
}
