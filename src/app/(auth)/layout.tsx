import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { AuthEmailProvider } from '@/components/auth/auth-email'
import { AuthEnvelope } from '@/components/auth/auth-envelope'
import { PublicNav } from '@/components/landing/public-nav'
import { PopLink } from '@/components/motion'
import { getSessionUser } from '@/server/session'

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (user && !user.isAnonymous) redirect('/works')

  return (
    <div className="b-root flex min-w-0 flex-1 flex-col">
      <PublicNav />
      <main className="b-landing-account">
        <div className="b-wrap b-landing-account-grid">
          <header className="b-landing-account-heading">
            <h1 className="b-display">
              <span className="b-landing-login-title b-word">로그인</span>
              <span className="b-landing-signup-title b-word">가입</span>
            </h1>
            <p className="b-lede mt-4 font-bold">작가 대신 설정을 기억하는 연재 파트너</p>
          </header>
          <div className="b-paper b-landing-account-panel bg-paper">
            <AuthEmailProvider>{children}</AuthEmailProvider>
          </div>
          <AuthEnvelope />
        </div>
      </main>
      <footer className="b-landing-footer">
        <div className="b-wrap flex min-h-[7.5rem] flex-wrap items-center justify-between gap-3 py-4">
          <p className="b-label b-muted">다음화 · 장기 연재 작가를 위한 설정 위키와 회차 점검</p>
          <nav className="flex flex-wrap gap-2" aria-label="돌아가기">
            <PopLink href="/" variant="flat" arrow={<ArrowLeft className="b-icon" />}>
              소개
            </PopLink>
            <PopLink href="/#b-sample" variant="flat">
              샘플 원고 보기
            </PopLink>
          </nav>
        </div>
      </footer>
    </div>
  )
}
