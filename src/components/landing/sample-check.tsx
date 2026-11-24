'use client'

import { useState, type CSSProperties } from 'react'
import {
  CellMeter,
  CountCell,
  MarginNote,
  ProofPair,
  ProofUnderline,
  useReplay,
} from '@/components/motion'
import { LandingTitle, useLandingEntrance } from './entrance'
import { ReplayButton } from './paper-scenes'
import { episodes, findings, type Finding } from './sample-data'

function Comparison({ finding, index }: { finding: Finding; index: number }) {
  return (
    <li
      className="wg-landing-sample-row"
      style={{ '--wg-landing-sample-order': index } as CSSProperties}
    >
      <ProofPair
        className="wg-landing-sample-proof"
        manuscript={
          <div className="wg-landing-sample-draft">
            <p className="b-label font-mono">
              <span className="b-number wg-landing-sample-line-number" aria-hidden="true">
                {finding.number}
              </span>
              {finding.chapter}화 · 원고
            </p>
            <p className="wg-landing-sample-sentence font-heading font-bold">
              {finding.before}
              <ProofUnderline>{finding.wrong}</ProofUnderline>
              {finding.after}
            </p>
          </div>
        }
        note={
          <MarginNote
            source={
              <a className="b-link" href="#b-facts">
                {finding.citation}
              </a>
            }
          >
            {finding.quote}
          </MarginNote>
        }
      />
    </li>
  )
}

const steps = [
  { label: '원고', percent: 77 },
  { label: '근거', percent: 94 },
  { label: '제안', percent: 63 },
]

function CheckProcess() {
  const { replayKey, replay } = useReplay()
  return (
    <aside className="wg-landing-sample-process" aria-label="점검 과정">
      <div className="wg-landing-sample-head">
        <h3 className="b-subhead">점검 과정</h3>
        <ReplayButton onClick={replay} aria-label="점검 과정 다시 보기" />
      </div>
      <ol key={replayKey} data-replay={replayKey > 0}>
        {steps.map(({ label, percent }, index) => (
          <li
            key={label}
            className="wg-landing-sample-step"
            style={{ '--wg-landing-sample-order': index } as CSSProperties}
          >
            <span className="b-label font-medium">{label}</span>
            <CellMeter value={percent} max={100} label={label} />
          </li>
        ))}
      </ol>
    </aside>
  )
}

export function SampleCheck() {
  const [chapter, setChapter] = useState<'all' | 1 | 2 | 3>('all')
  const entrance = useLandingEntrance<HTMLDivElement>()
  const resultEntrance = useLandingEntrance<HTMLDivElement>()
  const selected = episodes.find((episode) => episode.number === chapter)
  const results = chapter === 'all' ? findings : findings.filter((item) => item.chapter === chapter)

  return (
    <section id="b-sample" className="b-band" aria-labelledby="b-sample-title">
      <div {...entrance} className="b-wrap wg-landing-sample-layout">
        <div className="wg-landing-sample-intro">
          <LandingTitle id="b-sample-title">근거 없이는 지적하지 않아요</LandingTitle>
          <p className="b-lede">
            샘플 작품 1~3화에 설정 오류를 일부러 세 군데 심어 뒀어요. 아래는 점검이 찾아낸 그 세
            문장이에요.
          </p>
        </div>
        <div className="min-w-0 wg-landing-sample-content">
          <div role="region" aria-label="예시 회차" className="wg-landing-sample-episodes">
            {episodes.map((episode) => (
              <a
                key={episode.number}
                className="wg-landing-sample-episode"
                href="#b-sample-result"
                aria-label={`${episode.number}화 ${episode.title} ${episode.excerpt}`}
                aria-current={chapter === episode.number ? true : undefined}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  event.preventDefault()
                  setChapter(episode.number)
                }}
              >
                <span className="wg-landing-sample-episode-title">
                  <span className="font-mono">{episode.number}화</span> {episode.title}
                </span>
                <span className="wg-landing-sample-excerpt">{episode.excerpt}</span>
              </a>
            ))}
          </div>
          <div
            {...resultEntrance}
            id="b-sample-result"
            className="wg-landing-sample-results"
            tabIndex={-1}
          >
            <div className="wg-landing-sample-head wg-landing-sample-result-head">
              <h3 className="b-subhead">
                {selected ? (
                  <>
                    <span className="font-mono">{selected.number}화</span> · {selected.title}
                  </>
                ) : (
                  '1~3화 전체'
                )}
              </h3>
              <span className="sr-only" aria-live="polite">
                지적 {results.length}건
              </span>
              <span className="b-label shrink-0" aria-hidden="true">
                지적 <CountCell key={chapter} value={results.length} unit="건" />
              </span>
            </div>
            {results.length ? (
              <ol key={chapter}>
                {results.map((finding, index) => (
                  <Comparison key={finding.id} finding={finding} index={index} />
                ))}
              </ol>
            ) : (
              <p className="wg-landing-sample-empty">열린 지적이 없어요.</p>
            )}
            {selected && (
              <button
                type="button"
                className="b-link wg-landing-sample-reset"
                onClick={(event) => {
                  event.currentTarget.closest<HTMLElement>('#b-sample-result')?.focus({
                    preventScroll: true,
                  })
                  setChapter('all')
                }}
              >
                세 문장 모두 보기
              </button>
            )}
          </div>
        </div>
        <CheckProcess />
      </div>
    </section>
  )
}
