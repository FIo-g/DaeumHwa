import Link from 'next/link'
import { cn } from '@/lib/utils'

export type WikiTab =
  'characters' | 'world' | 'threads' | 'graph' | 'naming' | 'summaries' | 'styles' | 'requests'

const TABS: { key: WikiTab; label: string; path: (workId: string) => string }[] = [
  { key: 'characters', label: '인물', path: (w) => `/works/${w}/wiki?tab=characters` },
  { key: 'world', label: '세계관', path: (w) => `/works/${w}/wiki?tab=world` },
  { key: 'threads', label: '떡밥 장부', path: (w) => `/works/${w}/wiki/threads` },
  { key: 'graph', label: '관계 그래프', path: (w) => `/works/${w}/wiki/graph` },
  { key: 'naming', label: '표기 통일', path: (w) => `/works/${w}/wiki?tab=naming` },
  { key: 'summaries', label: '회차 요약', path: (w) => `/works/${w}/wiki?tab=summaries` },
  { key: 'styles', label: '문체 카드', path: (w) => `/works/${w}/wiki?tab=styles` },
  { key: 'requests', label: '요청', path: (w) => `/works/${w}/wiki?tab=requests` },
]

/** Tab bar of the settings board. Tabs are links so each state has its own URL. */
export function WikiTabs({ workId, active }: { workId: string; active: WikiTab }) {
  return (
    <nav aria-label="설정 보드 탭" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-rule">
      {TABS.map((tab) => {
        const current = tab.key === active
        return (
          <Link
            key={tab.key}
            href={tab.path(workId)}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'relative pb-2 text-sm',
              current
                ? 'font-semibold text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
