import Link from 'next/link'
import type { ReactNode } from 'react'
import { CountCell, Sheet } from '@/components/motion'
import { formatKoreanDate, formatKoreanDateTime } from '@/lib/dates'
import { THREAD_STATUS_LABEL } from '@/lib/labels'
import type { PeriodicAlerts } from '@/server/alerts'
import type { WorkHome } from '@/server/dashboard'

export type HomePanelsProps = {
  workId: string
  pendingCount: number
  openThreads: WorkHome['openThreads']
  alerts: PeriodicAlerts
  schedule: WorkHome['schedule']
  recentChanges: { id: string; summary: string; createdAt: Date }[]
}

const AXIS_CELLS = 6

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
  const lastPosition = Math.max(
    AXIS_CELLS,
    ...threads.flatMap(({ plantedPosition, targetPosition }) => [
      plantedPosition ?? 1,
      targetPosition ?? 1,
    ]),
  )

  return (
    <>
      <Sheet as="div" className="wg-home-sheet">
        <div className="wg-home-folds">
          <Panel name="approvals" number="01" title="승인 대기">
            <p className="wg-home-total">
              <CountCell value={pendingCount} unit="건" className="wg-home-total-number" />
              <span className="b-label block">승인을 기다리는 제안</span>
            </p>
            <Link href={`${base}/approvals`} className="b-link wg-home-link">
              승인 대기 보기
            </Link>
          </Panel>

          <Panel name="threads" number="02" title="열린 떡밥">
            {threads.length === 0 ? (
              <EmptyRow>열린 떡밥이 없어요.</EmptyRow>
            ) : (
              <div
                className="wg-home-threads"
                role={threads.length > 1 ? 'region' : undefined}
                aria-label={threads.length > 1 ? '열린 떡밥 미리 보기' : undefined}
              >
                {threads.map((thread) => (
                  <ThreadPreview key={thread.id} thread={thread} lastPosition={lastPosition} />
                ))}
              </div>
            )}
            <Link href={`${base}/wiki/threads`} className="b-link wg-home-link">
              떡밥 장부 보기
            </Link>
          </Panel>

          <Panel name="alerts" number="03" title="주기 점검">
            <div className="wg-home-checks">
              <CountCell value={alerts.total} unit="건" className="wg-home-total-number" />
              <AlertList alerts={alerts} />
            </div>
          </Panel>

          <Panel name="schedule" number="04" title="일정">
            <dl className="wg-home-schedule">
              <div className="b-row wg-home-row">
                <dt>비축</dt>
                <dd>
                  <CountCell value={schedule.bufferCount} unit="화" />
                </dd>
              </div>
              <div className="b-row wg-home-row">
                <dt>다음 연재일</dt>
                <dd>
                  {schedule.nextPublishDate
                    ? formatKoreanDate(schedule.nextPublishDate)
                    : '정해지지 않음'}
                </dd>
              </div>
              <div className="b-row wg-home-row">
                <dt>소진 예상일</dt>
                <dd>
                  {schedule.bufferRunsOutOn ? formatKoreanDate(schedule.bufferRunsOutOn) : '없음'}
                </dd>
              </div>
              <div className="b-row wg-home-row">
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
            <Link href={`${base}/schedule`} className="b-link wg-home-link">
              일정 보기
            </Link>
          </Panel>
          <span className="wg-home-fold" aria-hidden="true" />
        </div>
      </Sheet>

      <section className="wg-home-changes" aria-labelledby="home-changes">
        <h2 id="home-changes" className="wg-home-section-title">
          최근 변경
        </h2>
        {recentChanges.length === 0 ? (
          <EmptyRow>아직 변경 이력이 없어요.</EmptyRow>
        ) : (
          <ul>
            {recentChanges.map((change) => (
              <li key={change.id}>
                <div className="b-row wg-home-row wg-home-change">
                  <p>{change.summary}</p>
                  <time dateTime={change.createdAt.toISOString()}>
                    {formatKoreanDateTime(change.createdAt)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link href={`${base}/history`} className="b-link wg-home-link">
          이력 보기
        </Link>
      </section>
    </>
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
  const cellInset = 50 / AXIS_CELLS
  const x = (position: number) =>
    `${cellInset + ((position - 1) / (lastPosition - 1)) * (100 - 2 * cellInset)}%`
  const sameChapter = planted !== null && planted === target
  const start = planted === null ? '0%' : sameChapter ? `calc(${x(planted)} - 8px)` : x(planted)
  const end = target === null ? start : sameChapter ? `calc(${x(target)} + 8px)` : x(target)
  const reverse = planted !== null && target !== null && planted > target

  return (
    <article className="b-row wg-home-row wg-home-thread" tabIndex={0}>
      <header className="wg-home-thread-meta">
        <h3 className="b-row__title">{thread.title}</h3>
        <div className="wg-home-status">
          <span>{THREAD_STATUS_LABEL[thread.status]}</span>
          {thread.overdue && <span>회수 목표 지남</span>}
        </div>
      </header>
      {(planted !== null || target !== null) && (
        <>
          <div className="wg-home-axis" aria-hidden="true">
            {Array.from({ length: AXIS_CELLS }, (_, index) => (
              <span className="wg-home-axis-cell" key={index} />
            ))}
            <span
              className="wg-home-axis-line"
              data-planned={planted === null}
              data-reverse={reverse}
              style={{
                insetInlineStart: reverse ? end : start,
                insetInlineEnd: `calc(100% - ${reverse ? start : end})`,
              }}
            />
            {planted !== null && (
              <span className="wg-home-planted" style={{ insetInlineStart: start }} />
            )}
            {target !== null && (
              <span className="wg-home-target" style={{ insetInlineStart: end }} />
            )}
          </div>
          <p className="wg-home-axis-labels">
            {planted !== null && <span>{planted}화 심음</span>}
            {target !== null && <span className="ml-auto">회수 목표 {target}화</span>}
          </p>
        </>
      )}
    </article>
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
    return <EmptyRow>지금 확인할 항목이 없어요.</EmptyRow>
  }
  return (
    <ul>
      {messages.map((message, index) => (
        <li key={`${index}:${message}`}>
          <p className="b-row wg-home-row">{message}</p>
        </li>
      ))}
    </ul>
  )
}

export function HomeBlankLine() {
  return (
    <span className="wg-home-blank-line" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  )
}

function EmptyRow({ children }: { children: string }) {
  return (
    <p className="b-row wg-home-row wg-home-empty">
      <HomeBlankLine />
      <span>{children}</span>
    </p>
  )
}

function Panel({
  name,
  number,
  title,
  children,
}: {
  name: string
  number: string
  title: string
  children: ReactNode
}) {
  const id = `home-${name}`
  return (
    <section aria-labelledby={id} className="wg-home-panel" data-panel={name}>
      <header className="wg-home-panel-head">
        <h2 id={id} className="wg-home-section-title">
          {title}
        </h2>
        <span aria-hidden="true">{number}</span>
      </header>
      {children}
    </section>
  )
}
