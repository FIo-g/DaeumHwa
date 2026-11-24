'use client'

import { BookOpen } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { usePointerTilt, useReplay } from '@/components/motion'
import { paperPiece, ReplayButton } from '@/components/landing/paper-scenes'
import { sampleCaption } from '@/components/landing/sample-data'

export function AuthEnvelope() {
  const { replayKey, replay } = useReplay()
  const pathname = usePathname()
  const tilt = usePointerTilt()

  return (
    <figure className="b-landing-envelope-wrap">
      <div className="b-landing-envelope b-pointer" aria-hidden="true" {...tilt}>
        <div className="b-landing-envelope-backdrop b-landing-envelope-backdrop-slow b-decor" />
        <div className="b-landing-envelope-backdrop b-landing-envelope-backdrop-fast b-decor" />
        <div className="b-landing-envelope-assembly b-scene-run" key={`${pathname}-${replayKey}`}>
          <div className="b-landing-envelope-ticket b-piece" style={paperPiece(0, -36, -32)}>
            <div className="b-cycle-paper">
              <span>3</span>
              <span className="b-label font-bold">종루의 손짓</span>
            </div>
          </div>
          <div className="b-landing-envelope-slip b-piece" style={paperPiece(1, 36, -40)}>
            <span />
            <span />
            <span />
          </div>
          <div className="b-landing-envelope-back b-piece" style={paperPiece(2, -25, 32)} />
          <div className="b-landing-envelope-front b-piece" style={paperPiece(3, 24, 26)}>
            <svg
              viewBox="0 0 240 110"
              preserveAspectRatio="none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                vectorEffect="non-scaling-stroke"
                d="M0 0 120 78 240 0M0 110l84-55m72 0 84 55"
              />
            </svg>
            <span className="b-landing-envelope-seal b-fade [--b-delay:calc(var(--b-stagger)*3)]">
              <BookOpen className="b-icon" />
            </span>
          </div>
          <span className="b-landing-envelope-note b-hand b-enter [--b-delay:calc(var(--b-stagger)*2)]">
            3화 교정쇄
          </span>
        </div>
      </div>
      <figcaption className="b-landing-caption">
        <span className="b-label">{sampleCaption}</span>
        <ReplayButton onClick={replay}>원고 봉투 다시 보기</ReplayButton>
      </figcaption>
    </figure>
  )
}
