'use client'

import { useState } from 'react'
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

  return (
    <div data-chapter-position={position} className="min-w-0">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} className="gap-3">
        <div className="wg-writing-tab-dock">
          <TabsList aria-label="작업 패널 탭" className="wg-writing-tabs flex w-full flex-wrap">
            {TABS.filter((item) => !data.trial || TRIAL_TABS.has(item.value)).map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="wg-writing-tab flex-auto px-2 whitespace-normal max-md:px-3"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
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
