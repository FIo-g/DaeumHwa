'use client'

import { useState, type CSSProperties } from 'react'
import { ColorBand, Disclosure, Reveal } from '@/components/motion'
import { LandingTitle, PaperBoundary, landingOrder, useLandingEntrance } from './entrance'

const axis = [1, 2, 3, 4, 5, 6]
const threads = [
  {
    title: '어머니의 편지',
    start: 1,
    end: 5,
    planted: true,
    detail: '세린이 품에 지닌 편지. 봉인은 아직 뜯지 않았다.',
    color: 'bg-paper',
  },
  {
    title: '불 꺼진 종루',
    start: 2,
    end: 2,
    planted: true,
    detail: '밤이 되어도 불이 켜지지 않는 종루. 이유는 아직 모른다.',
    color: 'bg-sand',
  },
  {
    title: '탑 벽의 표식',
    start: 3,
    end: 6,
    planted: false,
    detail: '탑 입구 벽에 누군가 긁어 놓은 표식.',
    color: 'bg-kraft',
  },
]

const chapterPosition = (chapter: number) => `${((chapter - 0.5) / axis.length) * 100}%`

export function ThreadPreview() {
  const entrance = useLandingEntrance<HTMLDivElement>()
  const [open, setOpen] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const active = threads.find((thread) => thread.title === (hover ?? focus ?? open))

  return (
    <ColorBand
      color="paper"
      className="b-landing-threads"
      id="b-threads"
      aria-labelledby="b-threads-title"
    >
      <PaperBoundary />
      <div className="b-landing-section-head">
        <LandingTitle id="b-threads-title">떡밥은 심은 화부터 거둘 화까지</LandingTitle>
        <p className="b-lede">
          떡밥은 몇 화에 심어서 몇 화에 거둘지까지 장부에 적어 둬요. 아래가 샘플 작품의 장부예요.
        </p>
      </div>
      <div className="b-landing-ledger" {...entrance}>
        <Reveal decorative className="b-landing-ledger-fold b-decor" aria-hidden="true" />
        <div
          className="b-landing-ledger-scroll b-table-scroll"
          role="region"
          aria-label="떡밥 회차 축"
          tabIndex={0}
        >
          <div className="b-landing-ledger-inner">
            <div aria-hidden="true" className="b-landing-ledger-underlay">
              {threads.map((thread) => (
                <span
                  key={thread.title}
                  className={`b-swap-layer ${thread.color}`}
                  data-active={active === thread}
                />
              ))}
            </div>
            <div className="b-landing-ledger-axis">
              <span className="b-landing-ledger-name">
                <span className="b-dot" aria-hidden="true" />
                회차
              </span>
              {axis.map((chapter) => (
                <span key={chapter} className={chapter === 3 ? 'bg-kraft' : undefined}>
                  <span
                    className="b-number"
                    data-highlight={active?.start === chapter || active?.end === chapter}
                  >
                    {chapter}화
                  </span>
                  {chapter === 3 && <span className="b-label">지금</span>}
                </span>
              ))}
            </div>
            {threads.map((thread, index) => {
              const overdue = thread.planted && thread.end < 3
              const same = thread.start === thread.end
              const start = chapterPosition(thread.start)
              const end = chapterPosition(thread.end)
              const label = thread.planted
                ? `${thread.title}: ${thread.start}화에 심음, ${thread.end}화에 회수 목표`
                : `${thread.title}: ${thread.start}화에 계획 시작, ${thread.end}화에 회수 목표`
              const summary = thread.planted
                ? `${thread.start}화에 심음 → ${thread.end}화 회수 목표`
                : `${thread.start}화부터 계획 → ${thread.end}화 회수 목표`
              return (
                <div
                  key={thread.title}
                  style={landingOrder(index)}
                  data-thread-active={[hover, focus, open].includes(thread.title)}
                  onPointerEnter={(event) => {
                    if (event.pointerType === 'mouse') setHover(thread.title)
                  }}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setFocus(thread.title)}
                  onBlur={() => setFocus(null)}
                >
                  <Disclosure
                    className="b-landing-thread"
                    open={open === thread.title}
                    onOpenChange={(expanded) => setOpen(expanded ? thread.title : null)}
                    title={
                      <>
                        <span className="b-landing-ledger-name">{thread.title}</span>
                        <span className="b-landing-thread-summary b-label" aria-hidden="true">
                          {summary}
                        </span>
                        <span
                          className="b-landing-thread-track"
                          role="img"
                          aria-label={label}
                          style={
                            { '--b-landing-start': start, '--b-landing-end': end } as CSSProperties
                          }
                          data-same={same}
                        >
                          <span className="b-landing-thread-line" data-planned={!thread.planted} />
                          {thread.planted && <span className="b-landing-thread-seed" />}
                          <span className="b-landing-thread-target" />
                        </span>
                        {overdue && (
                          <span className="b-landing-overdue b-label">거둘 때가 지났어요</span>
                        )}
                      </>
                    }
                  >
                    <p className="b-landing-thread-detail">{thread.detail}</p>
                  </Disclosure>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="b-landing-caption">
        <ul className="b-label flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="장부 범례">
          <li className="flex items-center gap-2">
            <span className="b-landing-key-seed" aria-hidden="true" />
            심은 화
          </li>
          <li className="flex items-center gap-2">
            <span className="b-landing-key-target" aria-hidden="true" />
            회수 목표
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-dashed border-ink" aria-hidden="true" />
            계획
          </li>
        </ul>
      </div>
    </ColorBand>
  )
}
