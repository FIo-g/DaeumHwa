import Link from 'next/link'
import { PageHeader } from '@/components/app/page-header'

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

export function WikiTabs({ workId, active }: { workId: string; active: WikiTab }) {
  return (
    <nav aria-label="설정 보드 탭" className="wg-wiki-tabs">
      <div className="wg-wiki-tabs-strip">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.path(workId)}
            aria-current={tab.key === active ? 'page' : undefined}
            className="wg-wiki-cell"
          >
            <span>{tab.label}</span>
            <span aria-hidden="true" className="wg-wiki-cell-fill" data-label={tab.label} />
          </Link>
        ))}
      </div>
    </nav>
  )
}

export function SettingsBoardHeader({ workId, active }: { workId: string; active: WikiTab }) {
  return (
    <div className="wg-wiki-board">
      <PageHeader title="설정 보드" description="작품 설정을 모아 둔 곳이에요." />
      <WikiTabs workId={workId} active={active} />
    </div>
  )
}
