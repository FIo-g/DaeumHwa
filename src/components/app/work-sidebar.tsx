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

const MAIN_ITEMS: NavItem[] = [
  { key: 'home', label: '홈', path: '' },
  { key: 'write', label: '집필', path: '/write' },
  { key: 'chapters', label: '회차', path: '/chapters' },
  { key: 'wiki', label: '설정 보드', path: '/wiki' },
  { key: 'approvals', label: '승인 대기', path: '/approvals', badge: 'pending' },
  { key: 'history', label: '이력', path: '/history' },
  { key: 'schedule', label: '일정', path: '/schedule' },
  { key: 'advice', label: '방향 조언', path: '/advice' },
  { key: 'reader-sim', label: '독자 시뮬레이션', path: '/reader-sim' },
  { key: 'settings', label: '작품 설정', path: '/settings' },
]

const SECONDARY_ITEMS: NavItem[] = [
  { key: 'import', label: '가져오기', path: '/import' },
  { key: 'interview', label: '인터뷰', path: '/interview' },
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
            'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted',
            active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground',
          )}
        >
          <span>{item.label}</span>
          {item.badge === 'pending' && pendingCount > 0 && (
            <span
              data-slot="pending-count"
              className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
            >
              {pendingCount}
            </span>
          )}
        </Link>
      </li>
    )
  }

  return (
    <nav aria-label="작품 메뉴" className="flex flex-col gap-4">
      <ul className="flex flex-col gap-0.5">{MAIN_ITEMS.map(renderItem)}</ul>
      <ul className="flex flex-col gap-0.5 border-t pt-3">{SECONDARY_ITEMS.map(renderItem)}</ul>
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
      <div className="flex items-center gap-3 border-b px-4 py-2 md:hidden">
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
        <span className="truncate text-sm font-medium">{workTitle}</span>
      </div>
      <aside className="hidden w-56 shrink-0 flex-col gap-4 border-r px-3 py-6 md:flex">
        <p className="truncate px-3 text-sm font-semibold">{workTitle}</p>
        <NavList workId={workId} pendingCount={pendingCount} />
      </aside>
    </>
  )
}
