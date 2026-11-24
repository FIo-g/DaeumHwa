'use client'

import { ArrowRight, ChevronDown } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import {
  CardRail,
  ColorBand,
  ProofUnderline,
  Reveal,
  TiltCard,
  useReplay,
} from '@/components/motion'
import { LandingTitle, PaperBoundary, landingOrder, useLandingEntrance } from './entrance'
import { ReplayButton } from './paper-scenes'
import { episodes, findings, type Finding } from './sample-data'

function Comparison({ finding, added }: { finding: Finding; added: boolean }) {
  const entrance = useLandingEntrance<HTMLLIElement>()
  return (
    <li className="b-landing-comparison-row" {...entrance}>
      <div className="min-w-0">
        <p className="b-label flex items-center gap-2 font-bold">
          <span className={added ? 'b-number b-sequence' : 'b-number'}>{finding.number}</span>
          {finding.chapter}화 · 원고
        </p>
        <p className="b-manuscript mt-1">
          {finding.before}
          <ProofUnderline>{finding.wrong}</ProofUnderline>
          {finding.after}
        </p>
      </div>
      <div className="b-landing-comparison-source min-w-0">
        <p className="b-label font-bold">위키 원문</p>
        <blockquote className="b-quote b-quote--wiki mt-1">{finding.quote}</blockquote>
        <a className="b-link b-landing-inline" href="#b-facts">
          <span>{finding.citation}</span>
        </a>
      </div>
    </li>
  )
}

const steps = [
  { label: '원고', width: '77%' },
  { label: '근거', width: '94%' },
  { label: '제안', width: '63%' },
]

function CheckProcess() {
  const { replayKey, replay } = useReplay()
  return (
    <aside className="b-paper b-landing-process bg-paper" aria-label="점검 과정">
      <div className="b-landing-panel-head">
        <h3 className="b-subhead">점검 과정</h3>
        <ReplayButton onClick={replay} aria-label="점검 과정 다시 보기" />
      </div>
      <ol className="mt-4 grid gap-2">
        {steps.map(({ label, width }, index) => (
          <li key={label} className="b-landing-process-step">
            <span className="b-label font-bold">{label}</span>
            <span className="b-landing-process-track" aria-hidden="true">
              <span
                key={replayKey}
                className={replayKey ? 'b-pass' : 'b-landing-scroll-fill'}
                style={{ width, '--b-i': index } as CSSProperties}
              />
            </span>
          </li>
        ))}
      </ol>
      <Reveal decorative className="b-landing-process-art b-decor" aria-hidden="true">
        <div key={replayKey} className={replayKey ? 'b-scene-run' : undefined}>
          {['1', '2', '3', '3화'].map((step, index) => (
            <span
              key={step}
              className="b-landing-process-slip b-cycle-orbit"
              style={{ animationDelay: `calc(var(--b-stagger) * ${index})` }}
            >
              {step}
            </span>
          ))}
          <span className="b-landing-process-nib b-meet [--b-from-x:-36px]" />
          <span className="b-landing-process-nib b-meet [--b-from-x:36px]" />
        </div>
      </Reveal>
    </aside>
  )
}

export function SampleCheck() {
  const [chapter, setChapter] = useState(3)
  const [more, setMore] = useState(false)
  const railEntrance = useLandingEntrance<HTMLDivElement>()
  const selected = episodes.find((episode) => episode.number === chapter)!
  const results = findings.filter((item) => item.chapter === chapter || (chapter === 3 && more))

  return (
    <ColorBand
      color="leaf"
      id="b-sample"
      className="b-landing-sample"
      aria-labelledby="b-sample-title"
    >
      <PaperBoundary />
      <div className="b-landing-section-head">
        <LandingTitle id="b-sample-title">근거 없이는 지적하지 않아요</LandingTitle>
        <p className="b-lede">
          샘플 작품 1~3화에 설정 오류를 일부러 세 군데 심어 뒀어요. 아래는 점검이 찾아낸 그 세
          문장이에요.
        </p>
      </div>
      <div {...railEntrance} className="b-landing-rail-entrance mt-2">
        <CardRail label="예시 회차" railClassName="b-landing-episodes">
          {episodes.map((episode, index) => (
            <TiltCard
              key={episode.number}
              pointer={false}
              className={`${episode.angle} b-landing-episode`}
              faceClassName={episode.color}
              style={landingOrder(index)}
            >
              <span key={chapter} className="b-landing-episode-rules b-fade" aria-hidden="true" />
              <a
                className="b-landing-episode-link"
                href="#b-sample-result"
                aria-label={`${episode.title} ${episode.excerpt}`}
                aria-current={chapter === episode.number}
                onClick={() => setChapter(episode.number)}
                onDragStart={(event) => event.preventDefault()}
              >
                <span className="b-landing-episode-no" aria-hidden="true">
                  {episode.number}화
                </span>
                <span className="b-row__title">
                  {episode.number === 3 ? episode.title : '점검'}
                </span>
                <span className="b-landing-episode-excerpt">{episode.excerpt}</span>
                <ArrowRight className="b-icon" aria-hidden="true" />
              </a>
            </TiltCard>
          ))}
        </CardRail>
      </div>
      <div className="b-landing-results" id="b-sample-result" tabIndex={-1}>
        <div className="b-paper min-w-0 bg-paper">
          <div className="b-landing-panel-head">
            <h3 className="b-subhead">
              {chapter === 3 ? '3화 · ' : ''}
              {selected.title}
            </h3>
            <span className="b-label shrink-0" aria-live="polite">
              지적 {results.length}건
            </span>
          </div>
          {results.length ? (
            <ol className="mt-3">
              {results.map((finding) => (
                <Comparison
                  key={finding.id}
                  finding={finding}
                  added={finding.chapter !== chapter}
                />
              ))}
            </ol>
          ) : (
            <p className="mt-4">열린 지적이 없어요.</p>
          )}
          {chapter === 3 && (
            <button
              type="button"
              className="b-landing-more"
              aria-disabled={more}
              onClick={() => setMore(true)}
            >
              {more ? '지적을 모두 봤어요' : '지적 더 보기'}
              {!more && <ChevronDown className="b-icon" aria-hidden="true" />}
            </button>
          )}
        </div>
        <CheckProcess />
      </div>
    </ColorBand>
  )
}
