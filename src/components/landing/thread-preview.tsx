'use client'

import { useState, type CSSProperties } from 'react'
import { Disclosure } from '@/components/motion'
import { threadChapterCenter } from '@/components/threads/thread-geometry'
import { LandingTitle, useLandingEntrance } from './entrance'

const axis = [1, 2, 3, 4, 5, 6]
const currentChapter = 3
const threads = [
  {
    title: '어머니의 편지',
    start: 1,
    end: 5,
    planted: true,
    detail: '세린이 품에 지닌 편지. 봉인은 아직 뜯지 않았다.',
  },
  {
    title: '불 꺼진 종루',
    start: 2,
    end: 2,
    planted: true,
    detail: '밤이 되어도 불이 켜지지 않는 종루. 이유는 아직 모른다.',
  },
  {
    title: '탑 벽의 표식',
    start: 3,
    end: 6,
    planted: false,
    detail: '탑 입구 벽에 누군가 긁어 놓은 표식.',
  },
]

const seedWidthRem = 0.5
const targetWidthRem = 1
const chapterPosition = (chapter: number) => `${threadChapterCenter(chapter, axis.length, 100)}%`
const ledgerStyle = {
  '--wg-landing-threads-count': axis.length,
  '--wg-landing-threads-seed-size': `${seedWidthRem}rem`,
  '--wg-landing-threads-target-size': `${targetWidthRem}rem`,
} as CSSProperties

export function ThreadPreview() {
  const entrance = useLandingEntrance<HTMLDivElement>()
  const [open, setOpen] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const active = threads.find((thread) => thread.title === (hover ?? focus ?? open))

  return (
    <section id="b-threads" aria-labelledby="b-threads-title">
      <div className="b-wrap wg-landing-threads-section wg-landing-threads-layout">
        <div className="min-w-0 space-y-4">
          <LandingTitle id="b-threads-title">떡밥은 심은 화부터 거둘 화까지</LandingTitle>
          <p className="b-lede">
            떡밥은 몇 화에 심어서 몇 화에 거둘지까지 장부에 적어 둬요. 아래가 샘플 작품의 장부예요.
          </p>
        </div>
        <div className="wg-landing-threads-ledger" style={ledgerStyle} {...entrance}>
          <div
            className="wg-landing-threads-scroll"
            role="region"
            aria-label="떡밥 회차 축"
            tabIndex={0}
          >
            <div className="wg-landing-threads-plot">
              <div className="wg-landing-threads-rails" aria-hidden="true">
                {axis.map((chapter) => (
                  <span key={chapter} />
                ))}
              </div>
              <div className="wg-landing-threads-axis">
                <span className="wg-landing-threads-axis-label">회차</span>
                <div className="wg-landing-threads-axis-cells">
                  {axis.map((chapter) => (
                    <span
                      key={chapter}
                      className="wg-landing-threads-axis-cell"
                      data-current={chapter === currentChapter || undefined}
                      data-highlight={active?.start === chapter || active?.end === chapter}
                    >
                      {chapter}화{chapter === currentChapter && <span>지금</span>}
                    </span>
                  ))}
                </div>
              </div>
              {threads.map((thread, index) => {
                const overdue = thread.planted && thread.end < currentChapter
                const same = thread.start === thread.end
                const label = thread.planted
                  ? `${thread.title}: ${thread.start}화에 심음, ${thread.end}화에 회수 목표`
                  : `${thread.title}: ${thread.start}화에 계획 시작, ${thread.end}화에 회수 목표`
                const summary = thread.planted
                  ? `${thread.start}화에 심음 → ${thread.end}화 회수 목표`
                  : `${thread.start}화부터 계획 → ${thread.end}화 회수 목표`
                return (
                  <div
                    key={thread.title}
                    className="wg-landing-threads-row"
                    style={{ '--wg-landing-threads-order': index } as CSSProperties}
                    data-thread-active={[hover, focus, open].includes(thread.title)}
                    onPointerEnter={(event) => {
                      if (event.pointerType === 'mouse') setHover(thread.title)
                    }}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setFocus(thread.title)}
                    onBlur={() => setFocus(null)}
                  >
                    <Disclosure
                      className="wg-landing-threads-disclosure"
                      open={open === thread.title}
                      onOpenChange={(expanded) => setOpen(expanded ? thread.title : null)}
                      title={
                        <>
                          <span className="wg-landing-threads-name">
                            <span className="wg-landing-threads-line-number" aria-hidden="true">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            {thread.title}
                          </span>
                          <span className="wg-landing-threads-summary b-label" aria-hidden="true">
                            {summary}
                          </span>
                          <span
                            className="wg-landing-threads-track"
                            role="img"
                            aria-label={label}
                            style={
                              {
                                '--wg-landing-threads-start': chapterPosition(thread.start),
                                '--wg-landing-threads-end': chapterPosition(thread.end),
                              } as CSSProperties
                            }
                            data-same={same}
                            data-planned={!thread.planted}
                          >
                            {thread.planted && (
                              <span
                                className="wg-landing-threads-seed"
                                data-thread-coincident={same ? 'seed' : undefined}
                              />
                            )}
                            {!same && <span className="wg-landing-threads-track-line" />}
                            <span
                              className="wg-landing-threads-target"
                              data-thread-coincident={same && thread.planted ? 'target' : undefined}
                            />
                          </span>
                          {overdue && (
                            <span className="wg-landing-threads-overdue">거둘 때가 지났어요</span>
                          )}
                        </>
                      }
                    >
                      <p className="wg-landing-threads-detail">{thread.detail}</p>
                    </Disclosure>
                  </div>
                )
              })}
            </div>
          </div>
          <ul className="wg-landing-threads-legend b-label" aria-label="장부 범례">
            <li>
              <span className="wg-landing-threads-seed" aria-hidden="true" />
              심은 화
            </li>
            <li>
              <span className="wg-landing-threads-target" aria-hidden="true" />
              회수 목표
            </li>
            <li>
              <span className="wg-landing-threads-plan-key" aria-hidden="true" />
              계획
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
