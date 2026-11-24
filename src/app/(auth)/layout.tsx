import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MenuSheet } from '@/components/motion/menu-sheet'
import { getSessionUser } from '@/server/session'

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (user && !user.isAnonymous) redirect('/works')
  return (
    <div className="b-root flex min-w-0 flex-1 flex-col">
      <header className="b-top">
        <div className="b-wrap b-nav-inner">
          <Link href="/" className="b-brand b-link">
            <span>다음화</span>
          </Link>
          <nav aria-label="길잡이" className="hidden sm:flex">
            <Link
              href="/"
              className="b-control b-link flex min-h-11 items-center rounded-button px-3 text-sm font-bold hover:bg-leaf"
            >
              <span>소개</span>
            </Link>
          </nav>
          <MenuSheet title="다음화" triggerClassName="sm:hidden">
            <Link href="/" className="b-row b-link flex items-center rounded-button border-0">
              <span>소개</span>
            </Link>
          </MenuSheet>
        </div>
      </header>
      <main className="b-band b-band--leaf b-auth-band flex flex-1 items-start sm:items-center">
        <div className="b-wrap flex min-w-0 flex-wrap items-center justify-between gap-8 lg:gap-12">
          <header className="min-w-0 flex-1 basis-[24rem]">
            <h1 className="b-display wrap-anywhere break-keep">다음화</h1>
            <p className="b-lede mt-4 font-bold">작가 대신 설정을 기억하는 연재 파트너</p>
          </header>
          <div className="b-paper w-full flex-1 basis-[22rem]">{children}</div>
        </div>
      </main>
    </div>
  )
}
