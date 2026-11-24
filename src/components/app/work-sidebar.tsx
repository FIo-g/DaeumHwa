'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CountCell, MenuSheet } from '@/components/motion'

type WorkSidebarProps = {
  workId: string
  workTitle: string
  pendingCount: number
  trial: boolean
}

type NavItem = {
  key: string
  label: string
  path: string
  badge?: 'pending'
  requiresSignup?: boolean
}

const HOME_ITEM: NavItem = { key: 'home', label: '홈', path: '' }
const SIGNUP_REQUIRED = '가입 필요'

// Grouped by what the author is doing: writing, keeping the canon, running the serial, the work.
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: '원고',
    items: [
      { key: 'write', label: '집필', path: '/write' },
      { key: 'chapters', label: '회차', path: '/chapters' },
    ],
  },
  {
    label: '설정',
    items: [
      { key: 'wiki', label: '설정 보드', path: '/wiki' },
      { key: 'approvals', label: '승인 대기', path: '/approvals', badge: 'pending' },
      { key: 'history', label: '이력', path: '/history' },
    ],
  },
  {
    label: '연재',
    items: [
      { key: 'schedule', label: '일정', path: '/schedule' },
      { key: 'advice', label: '방향 조언', path: '/advice', requiresSignup: true },
      { key: 'reader-sim', label: '독자 시뮬레이션', path: '/reader-sim', requiresSignup: true },
    ],
  },
  {
    label: '작품',
    items: [
      { key: 'settings', label: '작품 설정', path: '/settings' },
      { key: 'import', label: '가져오기', path: '/import', requiresSignup: true },
      { key: 'interview', label: '인터뷰', path: '/interview', requiresSignup: true },
    ],
  },
]

function isActive(pathname: string, href: string, homeHref: string): boolean {
  if (href === homeHref) return pathname === homeHref
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavList({ workId, pendingCount, trial }: Omit<WorkSidebarProps, 'workTitle'>) {
  const pathname = usePathname()
  const base = `/works/${workId}`

  const renderItem = (item: NavItem, index = 0) => {
    const href = `${base}${item.path}`
    const active = isActive(pathname, href, base)
    const signupRequired = trial && item.requiresSignup
    return (
      <li key={item.key}>
        <Link
          href={href}
          aria-label={signupRequired ? `${item.label} ${SIGNUP_REQUIRED}` : undefined}
          aria-current={active ? 'page' : undefined}
          className="wg-shell-menu-link"
        >
          <span className="wg-shell-line-number" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="wg-shell-menu-label">{item.label}</span>
          {item.badge === 'pending' && pendingCount > 0 && (
            <span data-slot="pending-count" className="wg-shell-pending-count">
              <CountCell value={pendingCount} />
            </span>
          )}
          {signupRequired && <span className="wg-shell-cell-label">{SIGNUP_REQUIRED}</span>}
        </Link>
      </li>
    )
  }

  return (
    <nav aria-label="작품 메뉴" className="wg-shell-menu">
      <ul>{renderItem(HOME_ITEM)}</ul>
      {GROUPS.map((group, groupIndex) => (
        <div key={group.label} className="wg-shell-menu-group">
          <p className="wg-shell-menu-heading">{group.label}</p>
          <ul>
            {group.items.map((item, index) =>
              renderItem(
                item,
                1 +
                  GROUPS.slice(0, groupIndex).reduce(
                    (count, previous) => count + previous.items.length,
                    0,
                  ) +
                  index,
              ),
            )}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/**
 * Work-section navigation: a fixed sidebar on wide screens, a sheet on narrow ones.
 * Every member sees the same links; the settings page itself shows read-only views to non-owners.
 */
export function WorkSidebar({ workId, workTitle, pendingCount, trial }: WorkSidebarProps) {
  return (
    <>
      <div className="wg-shell-mobile-menu md:hidden">
        <span className="wg-shell-work-name">{workTitle}</span>
        <MenuSheet
          title={workTitle}
          label="작품 메뉴 열기"
          triggerText="작품 메뉴 열기"
          className="wg-shell-menu-sheet"
          triggerClassName="wg-shell-work-trigger"
        >
          <NavList workId={workId} pendingCount={pendingCount} trial={trial} />
        </MenuSheet>
      </div>
      <aside className="wg-shell-sidebar hidden md:block">
        <p className="wg-shell-work-name">{workTitle}</p>
        <NavList workId={workId} pendingCount={pendingCount} trial={trial} />
      </aside>
    </>
  )
}
