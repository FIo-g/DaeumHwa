'use client'

import { RotateCcw } from 'lucide-react'
import { useLayoutEffect, type ComponentProps, type ReactNode } from 'react'
import {
  MarginNote,
  PopButton,
  ProofPair,
  ProofRing,
  ProofUnderline,
  useReplay,
} from '@/components/motion'
import { cn } from '@/lib/utils'
import { LandingTitle, landingOrder, useLandingEntrance } from './entrance'
import { findings, sampleCaption } from './sample-data'

const handCorrection = '오른손'

export function ReplayButton({ children, className, ...props }: ComponentProps<'button'>) {
  return (
    <PopButton
      variant="paper"
      arrow={<RotateCcw className="b-icon" aria-hidden="true" />}
      {...props}
      className={cn('wg-landing-hero-replay', className)}
    >
      {children}
    </PopButton>
  )
}

export function HeroProof() {
  const { replayKey, replay } = useReplay()
  const entrance = useLandingEntrance<HTMLElement>()

  useLayoutEffect(() => {
    if (replayKey === 0) return
    const rows = entrance.ref.current?.querySelector('aside')
    for (const animation of rows?.getAnimations?.({ subtree: true }) ?? []) {
      if (
        'animationName' in animation &&
        String(animation.animationName).startsWith('wg-landing-hero-')
      ) {
        animation.currentTime = 0
        animation.play()
      }
    }
  }, [entrance.ref, replayKey])

  return (
    <figure
      {...entrance}
      className="wg-landing-hero-proof"
      aria-labelledby="b-intro-proof-title"
      data-replayed={replayKey > 0}
    >
      <span className="wg-landing-hero-edge" aria-hidden="true">
        03
      </span>
      <h2 id="b-intro-proof-title">종루의 손짓</h2>
      <aside aria-label="위키 원문과 교정 메모">
        {findings.slice(0, 2).map((finding, index) => {
          const Mark = index === 0 ? ProofRing : ProofUnderline
          return (
            <article
              key={finding.id}
              className="wg-landing-hero-row"
              style={landingOrder(index)}
              tabIndex={0}
            >
              <div className="wg-landing-hero-rules" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <sup className="wg-landing-hero-line-no" aria-label={`지적 ${finding.number}`}>
                0{finding.number}
              </sup>
              <ProofPair
                className="wg-landing-hero-pair"
                manuscript={
                  <>
                    <p className="wg-landing-hero-manuscript-label">원고</p>
                    <p
                      className={cn(
                        'wg-landing-hero-sentence',
                        index === 1 && 'wg-landing-hero-sentence-corrected',
                      )}
                    >
                      {finding.before}
                      {index === 1 ? (
                        <span className="wg-landing-hero-correction-anchor">
                          <Mark>{finding.wrong}</Mark>
                          <span
                            className="wg-landing-hero-correction"
                            data-correction={handCorrection}
                            aria-hidden="true"
                          >
                            <svg viewBox="0 0 15 12">
                              <path pathLength="1" d="M2 11V2m0 9 5-3m-5 3 5-1m-5 1 9-8" />
                            </svg>
                          </span>
                        </span>
                      ) : (
                        <Mark>{finding.wrong}</Mark>
                      )}
                      {finding.after}
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
        <span className="wg-landing-hero-page" aria-hidden="true">
          04
        </span>
        <ReplayButton onClick={replay}>교정 슬립 다시 보기</ReplayButton>
      </div>
    </div>
  )
}
