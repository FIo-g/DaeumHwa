'use client'

import { BookOpenIcon, BookmarkIcon, NotebookIcon } from 'lucide-react'
import Link from 'next/link'
import { type CSSProperties, useLayoutEffect, useRef } from 'react'
import { ColorBand, usePointerTilt } from '@/components/motion'
import { readMotionDuration } from './wiki-motion'

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

let previousTab: { workId: string; index: number } | undefined

export function WikiTabs({ workId, active }: { workId: string; active: WikiTab }) {
  const index = TABS.findIndex((tab) => tab.key === active)
  const scrollRef = useRef<HTMLElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    const indicator = indicatorRef.current
    const current = scroll?.querySelector<HTMLAnchorElement>('[aria-current="page"]')
    if (!scroll || !indicator || !current) return

    const oldIndex = previousTab?.workId === workId ? previousTab.index : index
    previousTab = { workId, index }
    const from = (oldIndex - index) * current.offsetWidth
    if (from && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const motion = getComputedStyle(indicator)
      indicator.animate?.(
        [{ transform: 'translateX(' + from + 'px)' }, { transform: 'translateX(0)' }],
        {
          duration: readMotionDuration(indicator, '--b-step', 260),
          easing: motion.getPropertyValue('--b-out').trim() || 'ease-out',
        },
      )
    }
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
  }, [index, workId])

  return (
    <nav ref={scrollRef} aria-label="설정 보드 탭" className="b-wiki-tabs">
      <div className="b-wiki-tabs-strip" style={{ '--b-wiki-tab': index } as CSSProperties}>
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.path(workId)}
            aria-current={tab.key === active ? 'page' : undefined}
            className="b-wiki-tab b-link"
          >
            <span>{tab.label}</span>
          </Link>
        ))}
        <span ref={indicatorRef} className="b-wiki-tab-indicator" aria-hidden="true" />
      </div>
    </nav>
  )
}

function IndexSlips() {
  const tilt = usePointerTilt()
  const icons = [BookmarkIcon, BookOpenIcon, NotebookIcon]

  return (
    <div {...tilt} className="b-wiki-slips b-pointer" aria-hidden="true">
      <div className="b-pointer__face">
        {icons.map((Icon, index) => (
          <span
            key={index}
            className="b-wiki-slip b-piece"
            style={
              {
                '--b-wiki-slip': index,
                '--b-delay': 'calc(' + index + ' * var(--b-stagger))',
              } as CSSProperties
            }
          >
            <span className="b-wiki-slip-paper">
              <span className="b-wiki-slip-face b-cycle-paper">
                <Icon />
              </span>
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function SettingsBoardHeader({ workId, active }: { workId: string; active: WikiTab }) {
  return (
    <ColorBand
      color="leaf"
      density="app"
      className="b-wiki-band b-scene-run"
      innerClassName="b-wiki-hero"
    >
      <div className="b-wiki-hero-title">
        <h1 className="b-title">설정 보드</h1>
        <p className="b-lede">작품 설정을 모아 둔 곳이에요.</p>
      </div>
      <IndexSlips />
      <WikiTabs workId={workId} active={active} />
    </ColorBand>
  )
}
