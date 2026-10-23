import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

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
    <nav aria-label="설정 보드 탭" className="flex flex-wrap gap-1 border-b pb-2">
      {TABS.map((tab) => {
        const current = tab.key === active
        return (
          <Link
            key={tab.key}
            href={tab.path(workId)}
            aria-current={current ? 'page' : undefined}
            className={buttonVariants({ variant: current ? 'secondary' : 'ghost', size: 'sm' })}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
