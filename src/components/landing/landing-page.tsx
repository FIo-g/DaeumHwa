import Link from 'next/link'
import type { CSSProperties } from 'react'
import { PageEdge } from '@/components/app/page-header'
import { TrialButton } from '@/components/auth/trial-button'
import { AuthorChoice } from './author-choice'
import { LandingTitle, PaperBoundary } from './entrance'
import { ClosingSlip, HeroProof } from './paper-scenes'
import { PublicNav } from './public-nav'
import { SampleCheck } from './sample-check'
import { ThreadPreview } from './thread-preview'

const introTitle = '머릿속 설정집은 접어 두세요.'

function StartActions({ sampleLink = false }: { sampleLink?: boolean }) {
  return (
    <div className="wg-landing-hero-actions">
      <TrialButton large />
      <Link href="/signup" className="b-link">
        가입하기
      </Link>
      {sampleLink && (
        <a href="#b-sample" className="b-link">
          샘플 원고 보기
        </a>
      )}
    </div>
  )
}

export function LandingPage() {
  return (
    <div id="b-top" className="b-root">
      <PublicNav landing />
      <main>
        <section
          className="b-wrap wg-landing-hero-intro"
          aria-labelledby="b-intro-title"
          style={{ '--wg-landing-hero-letter-count': introTitle.length } as CSSProperties}
        >
          <div className="wg-landing-hero-title">
            <PageEdge className="wg-landing-hero-edge" showPageMark={false} />
            <LandingTitle id="b-intro-title" hero>
              {introTitle}
            </LandingTitle>
          </div>
          <div className="wg-landing-hero-copy">
            <p className="b-lede">
              다음화는 새 회차를 위키에 적어 둔 설정과 한 문장씩 맞춰 봐요.
              <span className="wg-landing-hero-lede-detail">
                {' '}
                어긋난 문장에는 빨간 줄을 긋고 근거가 된 위키 원문을 옆에 붙여 드려요. 고칠 쪽은
                작가님이 골라요.
              </span>
            </p>
            <StartActions sampleLink />
          </div>
          <HeroProof />
        </section>
        <PaperBoundary />
        <SampleCheck />
        <PaperBoundary />
        <AuthorChoice />
        <PaperBoundary />
        <ThreadPreview />
        <PaperBoundary />
        <section className="b-wrap" aria-labelledby="b-closing-title">
          <ClosingSlip actions={<StartActions />} />
        </section>
      </main>
      <footer className="wg-landing-hero-footer">
        <div className="b-wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3">
          <p className="b-label b-muted">다음화 · 장기 연재 작가를 위한 설정 위키와 회차 점검</p>
          <nav className="flex flex-wrap gap-x-4" aria-label="하단 길잡이">
            <a className="b-footer-link" href="#b-sample">
              예시 점검
            </a>
            <a className="b-footer-link" href="#b-facts">
              설정 보드
            </a>
            <a className="b-footer-link" href="#b-threads">
              떡밥 장부
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
