'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MenuIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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
  onNavigate,
}: {
  workId: string
  pendingCount: number
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const base = `/works/${workId}`

  const renderItem = (item: NavItem) => {
    const href = `${base}${item.path}`
    const active = isActive(pathname, href, base)
    return (
      <li key={item.key}>
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors hover:bg-sheet hover:text-foreground',
            active
              ? 'bg-sheet font-medium text-foreground shadow-[inset_0_0_0_1px_var(--rule)]'
              : 'text-muted-foreground',
          )}
        >
          <span>{item.label}</span>
          {item.badge === 'pending' && pendingCount > 0 && (
            <span
              data-slot="pending-count"
              className="min-w-5 rounded-sm bg-primary px-1.5 py-0.5 text-center text-xs text-primary-foreground tabular-nums"
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
      {GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 text-xs text-muted-foreground">{group.label}</p>
          <ul className="flex flex-col gap-0.5">{group.items.map(renderItem)}</ul>
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
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex items-center gap-3 border-b border-rule px-4 py-2 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="outline" size="sm" />}>
            <MenuIcon aria-hidden="true" />
            작품 메뉴 열기
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>{workTitle}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">
              <NavList
                workId={workId}
                pendingCount={pendingCount}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
        <span className="truncate font-serif text-sm font-semibold">{workTitle}</span>
      </div>
      <aside className="hidden w-56 shrink-0 flex-col gap-6 px-3 py-8 md:flex">
        <p className="truncate px-3 font-serif text-base font-semibold">{workTitle}</p>
        <NavList workId={workId} pendingCount={pendingCount} />
      </aside>
    </>
  )
}
