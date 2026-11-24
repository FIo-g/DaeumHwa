'use client'

import { RotateCcw } from 'lucide-react'
import type { ComponentProps, CSSProperties } from 'react'
import {
  HandNote,
  ProofRing,
  ProofUnderline,
  Reveal,
  ScanLine,
  usePointerTilt,
  useReplay,
} from '@/components/motion'
import { useLandingEntrance } from './entrance'
import { findings, sampleCaption } from './sample-data'

export function ReplayButton({ children, ...props }: ComponentProps<'button'>) {
  return (
    <button type="button" className="b-landing-replay" {...props}>
      <RotateCcw className="b-icon" aria-hidden="true" />
      {children}
    </button>
  )
}

export function paperPiece(index: number, x: number, y: number): CSSProperties {
  return {
    '--b-delay': `calc(var(--b-stagger) * ${index})`,
    '--b-from-x': `${x}px`,
    '--b-from-y': `${y}px`,
  } as CSSProperties
}

export function HeroProof() {
  const { replayKey, replay } = useReplay()
  const tilt = usePointerTilt()
  return (
    <figure className="min-w-0">
      <div className="b-landing-proof-stage b-pointer" {...tilt}>
        <div className="b-landing-proof-backing b-pointer__face b-decor" aria-hidden="true">
          <div className="b-scene-run">
            <div className="b-landing-proof-slip b-piece" style={paperPiece(0, -52, 20)}>
              <span className="b-landing-proof-slip-face b-cycle-paper bg-sand" />
            </div>
            <div
              className="b-landing-proof-slip b-landing-proof-slip-right b-piece"
              style={paperPiece(1, 45, 24)}
            >
              <span className="b-landing-proof-slip-face b-cycle-paper bg-cream" />
            </div>
            <span className="b-landing-proof-tab b-piece" style={paperPiece(2, 24, -32)} />
            <span className="b-landing-proof-corner b-piece" style={paperPiece(3, 28, 34)} />
            <span className="b-landing-proof-join b-meet bg-sand [--b-from-x:-36px]" />
            <span className="b-landing-proof-join b-meet bg-cream [--b-from-x:36px]" />
          </div>
        </div>
        <div className="b-paper b-landing-proof-sheet relative bg-paper">
          <div className="relative min-w-0">
            <header className="space-y-1 border-b-2 border-ink pb-3">
              <p className="b-label font-bold">원고</p>
              <h2 className="b-subhead">종루의 손짓</h2>
            </header>
            <div className="b-manuscript relative space-y-3 pt-3">
              {findings.slice(0, 2).map((finding, index) => {
                const Mark = index === 0 ? ProofRing : ProofUnderline
                const after = index === 0 ? finding.after : finding.after.slice(1)
                const tailStart = after.lastIndexOf(' ', after.lastIndexOf(' ') - 1) + 1
                return (
                  <p key={finding.id}>
                    {finding.before}
                    <Mark replayKey={replayKey} delay={index === 0 ? 420 : 840}>
                      {index === 0 ? finding.wrong : `${finding.wrong}에`}
                    </Mark>
                    {after.slice(0, tailStart)}
                    <span className="inline-block whitespace-nowrap">
                      {after.slice(tailStart)}
                      <sup
                        className="b-number ml-2 align-middle"
                        aria-label={`지적 ${finding.number}`}
                      >
                        {finding.number}
                      </sup>
                    </span>
                  </p>
                )
              })}
              <ScanLine replayKey={replayKey} className="b-landing-scan" />
            </div>
          </div>
          <aside className="b-landing-proof-notes" aria-label="위키 원문과 교정 메모">
            {findings.slice(0, 2).map((finding, index) => (
              <div key={finding.id}>
                <div className="b-landing-source-head">
                  <span className="b-number" aria-hidden="true">
                    {finding.number}
                  </span>
                  <span className="b-label font-bold">위키 원문</span>
                  <a className="b-link b-landing-inline" href="#b-sample-result">
                    <span>{finding.citation}</span>
                  </a>
                </div>
                <blockquote className="b-quote b-quote--wiki b-landing-hero-quote">
                  <span
                    key={replayKey}
                    style={{
                      animationDelay: `calc(var(--b-draw) * 3 + var(--b-stagger) * ${index})`,
                    }}
                  >
                    {finding.quote}
                  </span>
                </blockquote>
                <HandNote replayKey={replayKey} delay={1680 + index * 70}>
                  {finding.note}
                </HandNote>
              </div>
            ))}
          </aside>
        </div>
      </div>
      <figcaption className="b-landing-caption">
        <span className="b-label">{sampleCaption}</span>
        <ReplayButton onClick={replay}>교정 다시 보기</ReplayButton>
      </figcaption>
    </figure>
  )
}

export function ClosingSlip() {
  const { replayKey, replay } = useReplay()
  const entrance = useLandingEntrance<HTMLElement>()
  const replaying = replayKey > 0
  const running = replaying || entrance['data-landed']

  return (
    <figure {...entrance} className="b-landing-closing-figure">
      <Reveal decorative className="b-landing-dispense" aria-hidden="true">
        <div className={running ? 'b-scene-run' : undefined} data-auto={!replaying} key={replayKey}>
          <div className="b-landing-dispense-slip b-cycle-paper">
            <span />
            <span />
            <span />
          </div>
          <div className="b-landing-dispense-slot" />
          <svg
            className="b-landing-dispense-mark b-cycle-stamp"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 25c2-9 23-13 29-6 7 8-12 19-22 16-5-1-10-5-7-10Zm20-9 7-7m1 0h4m-1-1v5" />
          </svg>
        </div>
      </Reveal>
      <ReplayButton onClick={replay}>교정 슬립 다시 보기</ReplayButton>
    </figure>
  )
}
