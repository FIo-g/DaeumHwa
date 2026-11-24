import { BookOpen, ChartNoAxesColumn, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { TrialButton } from '@/components/auth/trial-button'
import { ColorBand } from '@/components/motion'
import { AuthorChoice } from './author-choice'
import { LandingTitle, PaperBoundary } from './entrance'
import { ClosingSlip, HeroProof } from './paper-scenes'
import { PublicNav } from './public-nav'
import { SampleCheck } from './sample-check'
import { ThreadPreview } from './thread-preview'

function StartActions({ sampleLink = false }: { sampleLink?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <TrialButton large />
      <Link href="/signup" className="b-link b-landing-inline">
        <span>가입하기</span>
      </Link>
      {sampleLink && (
        <a href="#b-sample" className="b-link b-landing-inline">
          <span>샘플 원고 보기</span>
          <ArrowRight className="b-icon" aria-hidden="true" />
        </a>
      )}
    </div>
  )
}

export function LandingPage() {
  return (
    <div id="b-top" className="b-root b-landing-root">
      <PublicNav landing />
      <main>
        <ColorBand color="kraft" className="b-landing-hero" aria-labelledby="b-intro-title">
          <LandingTitle id="b-intro-title" hero>
            머릿속 설정집은 접어 두세요.
          </LandingTitle>
          <div className="b-landing-hero-grid">
            <div className="min-w-0 space-y-6">
              <p className="b-lede">
                다음화는 새 회차를 위키에 적어 둔 설정과 한 문장씩 맞춰 봐요.
                <span className="b-landing-hero-lede-detail">
                  {' '}
                  어긋난 문장에는 빨간 줄을 긋고 근거가 된 위키 원문을 옆에 붙여 드려요. 고칠 쪽은
                  작가님이 골라요.
                </span>
              </p>
              <StartActions sampleLink />
            </div>
            <HeroProof />
          </div>
        </ColorBand>
        <SampleCheck />
        <AuthorChoice />
        <ThreadPreview />
        <ColorBand
          color="cream"
          className="b-landing-closing"
          innerClassName="b-landing-closing-grid"
          aria-labelledby="b-closing-title"
        >
          <PaperBoundary />
          <div className="min-w-0 space-y-6">
            <LandingTitle id="b-closing-title">샘플 원고로 먼저 돌려 보세요</LandingTitle>
            <StartActions />
          </div>
          <ClosingSlip />
        </ColorBand>
      </main>
      <footer className="b-landing-footer b-landing-band-end">
        <PaperBoundary />
        <div className="b-wrap flex min-h-24 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3">
          <p className="b-label b-muted">다음화 · 장기 연재 작가를 위한 설정 위키와 회차 점검</p>
          <nav className="flex flex-wrap gap-x-4" aria-label="하단 길잡이">
            <a className="b-link b-footer-link" href="#b-sample">
              <span>예시 점검</span>
            </a>
            <a className="b-link b-footer-link" href="#b-facts">
              <BookOpen className="b-icon" aria-hidden="true" />
              <span>설정 보드</span>
            </a>
            <a className="b-link b-footer-link" href="#b-threads">
              <ChartNoAxesColumn className="b-icon" aria-hidden="true" />
              <span>떡밥 장부</span>
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
