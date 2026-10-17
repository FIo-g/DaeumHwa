'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
export function WritingSidePanel({ data, api, text, position }: WritingSidePanelProps) {
  const [tab, setTab] = useState<TabKey>('related')

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
          <CheckPanel data={data} api={api} text={text} />
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
