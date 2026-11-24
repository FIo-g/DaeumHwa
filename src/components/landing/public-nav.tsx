import Link from 'next/link'
import { MenuSheet, PopLink } from '@/components/motion'

export function PublicNav({ landing = false }: { landing?: boolean }) {
  const links = landing
    ? [
        { href: '#b-sample', label: '예시 점검' },
        { href: '#b-threads', label: '떡밥 장부' },
      ]
    : [
        { href: '/', label: '소개' },
        { href: '/#b-sample', label: '샘플 원고 보기' },
      ]

  return (
    <header className="b-top b-landing-nav">
      <div className="b-wrap b-nav-inner">
        <Link href={landing ? '#b-top' : '/'} className="b-brand b-link">
          <span>다음화</span>
        </Link>
        <nav aria-label="길잡이" className="hidden items-center gap-6 sm:flex">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} className="b-link flex min-h-11 items-center font-bold">
              <span>{label}</span>
            </Link>
          ))}
          {landing && <PopLink href="/login">로그인</PopLink>}
        </nav>
        <MenuSheet title="다음화" triggerClassName="sm:hidden">
          {(landing ? [...links, { href: '/login', label: '로그인' }] : links).map(
            ({ href, label }) => (
              <Link key={href} href={href} className="b-row b-link rounded-button">
                <span>{label}</span>
              </Link>
            ),
          )}
        </MenuSheet>
      </div>
    </header>
  )
}
