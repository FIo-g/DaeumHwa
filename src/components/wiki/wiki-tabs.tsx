'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef } from 'react'
import { GridTitle } from '@/components/motion'

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
  const scrollRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    const current = scroll?.querySelector<HTMLAnchorElement>('[aria-current="page"]')
    if (!scroll || !current) return

    const revealActive = () => {
      if (
        current.offsetLeft < scroll.scrollLeft ||
        current.offsetLeft + current.offsetWidth > scroll.scrollLeft + scroll.clientWidth
      ) {
        scroll.scrollLeft = current.offsetLeft - (scroll.clientWidth - current.offsetWidth) / 2
      }
    }
    revealActive()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(revealActive)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [active, workId])

  return (
    <nav ref={scrollRef} aria-label="설정 보드 탭" className="wg-wiki-tabs">
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
    <header className="wg-wiki-board">
      <div className="b-edge" aria-hidden="true">
        20×10
      </div>
      <GridTitle as="h1" size="page" columns={5}>
        설정 보드
      </GridTitle>
      <p className="b-lede">작품 설정을 모아 둔 곳이에요.</p>
      <WikiTabs workId={workId} active={active} />
    </header>
  )
}
