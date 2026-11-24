'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/components/motion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAutoCheck } from '@/lib/client/auto-check'
import { isSampleChapter } from '@/lib/client/sample-session'
import { CheckPanel } from './panels/check-panel'
import { CommentsPanel } from './panels/comments-panel'
import { DraftPanel } from './panels/draft-panel'
import { OpenThreads } from './panels/open-threads'
import { ProofreadPanel } from './panels/proofread-panel'
import { ReaderPanel } from './panels/reader-panel'
import { RelatedCards } from './panels/related-cards'
import type { WritingSidePanelProps } from './types'

type TabKey = 'related' | 'threads' | 'check' | 'proofread' | 'comments' | 'draft' | 'reader'

const TRIAL_TABS = new Set<TabKey>(['related', 'threads', 'check'])

const TABS: { value: TabKey; label: string }[] = [
  { value: 'related', label: '관련 카드' },
  { value: 'threads', label: '떡밥' },
  { value: 'check', label: '점검' },
  { value: 'proofread', label: '맞춤법' },
  { value: 'comments', label: '코멘트' },
  { value: 'draft', label: 'AI 초안' },
  { value: 'reader', label: '독자 반응' },
]

/**
 * The writing screen's side panels. Every panel stays mounted (inactive ones are hidden), so a
 * running draft or a loaded check result survives switching tabs.
 */
export function WritingSidePanel({
  data,
  api,
  text,
  position,
  autoCheck,
  findings,
}: WritingSidePanelProps) {
  const tabList = useRef<HTMLDivElement>(null)
  const tabRail = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const [railState, setRailState] = useState({ overflowing: false, before: false, after: false })
  const auto = useAutoCheck(data.chapter.id)
  // The panel only mounts on the client (after the layout effect), so the session read is safe.
  const [tab, setTab] = useState<TabKey>(() =>
    autoCheck || findings?.requestedId || isSampleChapter(data.chapter.id) ? 'check' : 'related',
  )
  // Render-time previous-value state: switch tabs as soon as an auto check starts, without an effect.
  const [autoWasRunning, setAutoWasRunning] = useState(false)
  if (auto.running !== autoWasRunning) {
    setAutoWasRunning(auto.running)
    if (auto.running) setTab('check')
  }

  const requested = findings?.requestedId ?? null
  const [previousRequest, setPreviousRequest] = useState(requested)
  if (requested !== previousRequest) {
    setPreviousRequest(requested)
    if (requested) setTab('check')
  }

  useEffect(() => {
    const rail = tabRail.current
    const list = tabList.current
    const dock = rail?.parentElement
    if (!rail || !list || !dock) return

    const update = () => {
      const next = {
        overflowing: list.scrollWidth > dock.clientWidth + 1,
        before: rail.scrollLeft > 1,
        after: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1,
      }
      setRailState((current) =>
        current.overflowing === next.overflowing &&
        current.before === next.before &&
        current.after === next.after
          ? current
          : next,
      )
    }
    update()
    rail.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(rail)
    observer?.observe(list)
    return () => {
      rail.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [])

  function revealTab(target: HTMLElement | null | undefined) {
    const rail = tabRail.current
    if (!rail || !target) return
    const item = target.getBoundingClientRect()
    const viewport = rail.getBoundingClientRect()
    if (item.right > viewport.right - 4) rail.scrollLeft += item.right - viewport.right + 4
    else if (item.left < viewport.left + 4) rail.scrollLeft += item.left - viewport.left - 4
  }

  useEffect(() => {
    revealTab(tabList.current?.querySelector<HTMLElement>('[aria-selected="true"]'))
  }, [tab, railState.overflowing])

  function advanceTabs(direction: number) {
    const rail = tabRail.current
    if (!rail) return
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.7,
      behavior: reduced ? 'instant' : 'smooth',
    })
  }

  return (
    <div data-chapter-position={position} className="min-w-0">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} className="gap-3">
        <div className="wg-writing-tab-dock" data-overflow={railState.overflowing}>
          {railState.overflowing && (
            <button
              type="button"
              className="wg-writing-tab-edge"
              aria-label="앞쪽 탭 보기"
              aria-disabled={!railState.before}
              onClick={() => railState.before && advanceTabs(-1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </button>
          )}
          <div ref={tabRail} className="wg-writing-tab-rail">
            <TabsList
              ref={tabList}
              aria-label="작업 패널 탭"
              className="wg-writing-tabs flex w-max min-w-full max-w-none flex-nowrap"
            >
              {TABS.filter((item) => !data.trial || TRIAL_TABS.has(item.value)).map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="wg-writing-tab"
                  onFocus={(event) => revealTab(event.currentTarget)}
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {railState.overflowing && (
            <button
              type="button"
              className="wg-writing-tab-edge"
              aria-label="뒤쪽 탭 보기"
              aria-disabled={!railState.after}
              onClick={() => railState.after && advanceTabs(1)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </button>
          )}
        </div>

        <TabsContent value="related" keepMounted>
          <RelatedCards data={data} api={api} text={text} />
        </TabsContent>
        <TabsContent value="threads" keepMounted>
          <OpenThreads data={data} api={api} />
        </TabsContent>
        <TabsContent value="check" keepMounted>
          <CheckPanel data={data} api={api} text={text} autoRun={autoCheck} findings={findings} />
        </TabsContent>
        {!data.trial && (
          <>
            <TabsContent value="proofread" keepMounted>
              <ProofreadPanel data={data} api={api} text={text} />
            </TabsContent>
            <TabsContent value="comments" keepMounted>
              <CommentsPanel data={data} api={api} text={text} />
            </TabsContent>
            <TabsContent value="draft" keepMounted>
              <DraftPanel data={data} api={api} />
            </TabsContent>
            <TabsContent value="reader" keepMounted>
              <ReaderPanel data={data} api={api} text={text} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
