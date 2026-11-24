import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { AuthEmailProvider } from '@/components/auth/auth-email'
import { PublicNav } from '@/components/landing/public-nav'
import { PopLink } from '@/components/motion'
import { getSessionUser } from '@/server/session'

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (user && !user.isAnonymous) redirect('/works')

  return (
    <div className="b-root flex min-w-0 flex-1 flex-col">
      <PublicNav />
      <main className="wg-auth-main">
        <AuthEmailProvider>{children}</AuthEmailProvider>
      </main>
      <footer className="wg-auth-footer">
        <div className="b-wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3">
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
