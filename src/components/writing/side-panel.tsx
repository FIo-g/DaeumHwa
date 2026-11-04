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
export function WritingSidePanel({ data, api, text, position, autoCheck }: WritingSidePanelProps) {
  const auto = useAutoCheck(data.chapter.id)
  // The panel only mounts on the client (after the layout effect), so the session read is safe.
  const [tab, setTab] = useState<TabKey>(() =>
    autoCheck || isSampleChapter(data.chapter.id) ? 'check' : 'related',
  )
  // Render-time previous-value state: switch tabs as soon as an auto check starts, without an effect.
  const [autoWasRunning, setAutoWasRunning] = useState(false)
  if (auto.running !== autoWasRunning) {
    setAutoWasRunning(auto.running)
    if (auto.running) setTab('check')
  }

  return (
    <div data-chapter-position={position} className="flex min-w-0 flex-col gap-3">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} className="gap-3">
        <TabsList
          aria-label="작업 패널 탭"
          className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 group-data-horizontal/tabs:h-auto"
        >
          {TABS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="flex-none rounded-full border px-3 py-1 data-active:bg-muted"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="related" keepMounted>
          <RelatedCards data={data} api={api} text={text} />
        </TabsContent>
        <TabsContent value="threads" keepMounted>
          <OpenThreads data={data} api={api} />
        </TabsContent>
        <TabsContent value="check" keepMounted>
          <CheckPanel data={data} api={api} text={text} autoRun={autoCheck} />
        </TabsContent>
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
      </Tabs>
    </div>
  )
}
