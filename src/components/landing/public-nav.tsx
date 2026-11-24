import Link from 'next/link'
import { MenuSheet } from '@/components/motion'

export function PublicNav({ landing = false }: { landing?: boolean }) {
  const links = landing
    ? [
        { href: '#b-sample', label: '예시 점검' },
        { href: '#b-threads', label: '떡밥 장부' },
        { href: '/login', label: '로그인' },
      ]
    : [
        { href: '/', label: '소개' },
        { href: '/#b-sample', label: '샘플 원고 보기' },
      ]

  return (
    <header className="b-top wg-landing-hero-nav">
      <div className="b-wrap b-nav-inner">
        <Link href={landing ? '#b-top' : '/'} className="wg-landing-hero-logo" aria-label="다음화">
          <span aria-hidden="true">다</span>
          <span aria-hidden="true">음</span>
          <span aria-hidden="true">화</span>
        </Link>
        <nav aria-label="길잡이" className="hidden items-center gap-6 sm:flex lg:gap-9">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} className="wg-landing-hero-nav-link">
              {label}
            </Link>
          ))}
        </nav>
        <MenuSheet title="다음화" triggerClassName="sm:hidden">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} className="b-row b-link">
              {label}
            </Link>
          ))}
        </MenuSheet>
      </div>
    </header>
  )
}
