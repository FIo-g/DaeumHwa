'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'
import { MenuSheet } from '@/components/motion/menu-sheet'
import { cn } from '@/lib/utils'

type WorkSidebarProps = {
  workId: string
  workTitle: string
  pendingCount: number
}

type NavItem = {
  key: string
  label: string
  path: string
  badge?: 'pending'
}

const HOME_ITEM: NavItem = { key: 'home', label: '홈', path: '' }

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
      { key: 'advice', label: '방향 조언', path: '/advice' },
      { key: 'reader-sim', label: '독자 시뮬레이션', path: '/reader-sim' },
    ],
  },
  {
    label: '작품',
    items: [
      { key: 'settings', label: '작품 설정', path: '/settings' },
      { key: 'import', label: '가져오기', path: '/import' },
      { key: 'interview', label: '인터뷰', path: '/interview' },
    ],
  },
]

function isActive(pathname: string, href: string, homeHref: string): boolean {
  if (href === homeHref) return pathname === homeHref
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavList({
  workId,
  pendingCount,
  mobile = false,
}: {
  workId: string
  pendingCount: number
  mobile?: boolean
}) {
  const pathname = usePathname()
  const base = `/works/${workId}`

  const renderItem = (item: NavItem, index = 0) => {
    const href = `${base}${item.path}`
    const active = isActive(pathname, href, base)
    return (
      <li
        key={item.key}
        className={mobile ? 'b-nav-step' : undefined}
        style={mobile ? ({ '--b-i': Math.min(index, 5) } as CSSProperties) : undefined}
      >
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'b-control b-link flex min-h-11 items-center justify-between gap-2 rounded-button px-3 text-sm active:translate-y-px',
            active
              ? 'bg-ink font-bold text-paper underline decoration-2'
              : 'text-muted-ink hover:bg-sand hover:text-ink',
          )}
        >
          <span>{item.label}</span>
          {item.badge === 'pending' && pendingCount > 0 && (
            <span
              data-slot="pending-count"
              className="min-w-5 rounded-field bg-primary px-1.5 py-0.5 text-center text-xs text-primary-foreground tabular-nums"
            >
              {pendingCount}
            </span>
          )}
        </Link>
      </li>
    )
  }

  return (
    <nav aria-label="작품 메뉴" className="flex flex-col gap-5">
      <ul className="flex flex-col gap-0.5">{renderItem(HOME_ITEM)}</ul>
      {GROUPS.map((group, groupIndex) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 text-xs text-muted-foreground">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
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
export function WorkSidebar({ workId, workTitle, pendingCount }: WorkSidebarProps) {
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-rule bg-paper px-edge py-2 md:hidden">
        <span className="truncate font-heading text-lg">{workTitle}</span>
        <MenuSheet title={workTitle} label="작품 메뉴 열기" triggerText="작품 메뉴 열기">
          <NavList workId={workId} pendingCount={pendingCount} mobile />
        </MenuSheet>
      </div>
      <aside className="hidden w-56 shrink-0 flex-col gap-6 border-r border-rule bg-paper px-3 py-8 md:flex">
        <p className="wrap-anywhere px-3 font-heading text-xl break-keep">{workTitle}</p>
        <NavList workId={workId} pendingCount={pendingCount} />
      </aside>
    </>
  )
}
