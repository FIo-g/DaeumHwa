'use client'

import type { ComponentProps, ReactNode } from 'react'
import { MarginNote, ProofPair, ProofRing, ProofUnderline, useReplay } from '@/components/motion'
import { cn } from '@/lib/utils'
import { LandingTitle, landingOrder, useLandingEntrance } from './entrance'
import { findings, sampleCaption } from './sample-data'

const handCorrection = '오른손'

export function ReplayButton({ children, className, ...props }: ComponentProps<'button'>) {
  return (
    <button type="button" {...props} className={cn('b-link wg-landing-hero-replay', className)}>
      {children}
    </button>
  )
}

export function HeroProof() {
  const { replayKey, replay } = useReplay()
  const entrance = useLandingEntrance<HTMLElement>()

  return (
    <figure
      {...entrance}
      className="wg-landing-hero-proof"
      aria-labelledby="b-intro-proof-title"
      data-replayed={replayKey > 0}
    >
      <h2 id="b-intro-proof-title">종루의 손짓</h2>
      <aside key={replayKey} aria-label="위키 원문과 교정 메모">
        {findings.slice(0, 2).map((finding, index) => {
          const Mark = index === 0 ? ProofRing : ProofUnderline
          return (
            <article
              key={finding.id}
              className="wg-landing-hero-row"
              style={landingOrder(index)}
              tabIndex={0}
            >
              <sup className="wg-landing-hero-line-no" aria-label={`지적 ${finding.number}`}>
                {String(finding.number).padStart(2, '0')}
              </sup>
              <ProofPair
                className="wg-landing-hero-pair"
                replayKey={replayKey}
                manuscript={
                  <>
                    <p className="wg-landing-hero-manuscript-label">원고</p>
                    <p
                      className={cn(
                        'wg-landing-hero-sentence wg-landing-hero-ruled',
                        index === 1 && 'wg-landing-hero-sentence-corrected',
                      )}
                    >
                      <span className="wg-landing-hero-words">
                        {finding.before}
                        {index === 1 ? (
                          <span className="wg-landing-hero-correction-anchor">
                            <Mark replayKey={replayKey}>{finding.wrong}</Mark>
                            <span className="wg-landing-hero-correction" aria-hidden="true">
                              {handCorrection}
                            </span>
                          </span>
                        ) : (
                          <Mark replayKey={replayKey}>{finding.wrong}</Mark>
                        )}
                        {finding.after}
                      </span>
                    </p>
                    {index === 1 && <p className="sr-only">{handCorrection}</p>}
                  </>
                }
                note={
                  <MarginNote
                    source={
                      <a className="b-link" href="#b-sample-result">
                        {finding.citation}
                      </a>
                    }
                  >
                    {finding.quote}
                  </MarginNote>
                }
              />
            </article>
          )
        })}
      </aside>
      <figcaption className="wg-landing-hero-caption">
        <span>{sampleCaption}</span>
        <ReplayButton onClick={replay}>교정 다시 보기</ReplayButton>
      </figcaption>
    </figure>
  )
}

export function ClosingSlip({ actions }: { actions: ReactNode }) {
  const entrance = useLandingEntrance<HTMLDivElement>()
  const { replayKey, replay } = useReplay()

  return (
    <div {...entrance} className="wg-landing-hero-closing">
      <LandingTitle id="b-closing-title">샘플 원고로 먼저 돌려 보세요</LandingTitle>
      {actions}
      <div className="wg-landing-hero-closing-edge">
        <span key={replayKey} className="wg-landing-hero-closing-rule" aria-hidden="true" />
        <ReplayButton onClick={replay}>교정 슬립 다시 보기</ReplayButton>
      </div>
    </div>
  )
}
