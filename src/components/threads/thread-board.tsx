'use client'

import { useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { THREAD_STATUSES, type Role, type ThreadStatus } from '@/db/types'
import { IMPORTANCE_LABEL, THREAD_STATUS_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { ThreadDetailDialog } from './thread-detail-dialog'
import { ThreadForm } from './thread-form'
import type { ChapterOption, EntryOption, ThreadItem } from './thread-types'

type ThreadBoardProps = {
  workId: string
  role: Role
  threads: ThreadItem[]
  chapters: ChapterOption[]
  entries: EntryOption[]
}

/** Columns in ledger order: 계획됨, 심음, 발전 중, 회수, 폐기. */
const COLUMN_STATUSES: ThreadStatus[] = [...THREAD_STATUSES]

/** The foreshadowing ledger: one column per status, a card per thread. */
export function ThreadBoard({ workId, role, threads, chapters, entries }: ThreadBoardProps) {
  const canEdit = role === 'owner' || role === 'editor'
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const selected = threads.find((t) => t.id === selectedId) ?? null

  const newButton = canEdit && (
    <Dialog open={creating} onOpenChange={setCreating}>
      <DialogTrigger render={<Button />}>새 떡밥</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>새 떡밥</DialogTitle>
          <DialogDescription>심은 떡밥이나 계획만 있는 떡밥을 추가합니다.</DialogDescription>
        </DialogHeader>
        <ThreadForm
          workId={workId}
          chapters={chapters}
          entries={entries}
          onDone={() => setCreating(false)}
        />
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="flex flex-col gap-6">
      {newButton && <div className="flex justify-end">{newButton}</div>}

      {threads.length === 0 ? (
        <EmptyState
          title="아직 떡밥이 없습니다."
          description="작품에 심은 떡밥을 여기에 모아 두면 회수 시점을 놓치지 않습니다."
        />
      ) : (
        // Five columns only from xl, where each column still holds about 180px of card; below
        // that the columns wrap into rows of three or two.
        <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {COLUMN_STATUSES.map((status) => {
            const items = threads.filter((t) => t.status === status)
            const label = THREAD_STATUS_LABEL[status]
            return (
              <section key={status} aria-label={label} className="flex min-w-0 flex-col gap-2">
                <h2 className="flex items-baseline justify-between gap-2 border-b border-rule pb-2 text-sm font-medium">
                  <span data-slot="column-label">{label}</span>
                  <span className="text-muted-foreground tabular-nums">{items.length}</span>
                </h2>
                {items.length === 0 && (
                  <p className="py-2 text-sm text-muted-foreground">떡밥이 없습니다.</p>
                )}
                {items.map((thread) => (
                  <ThreadCardButton
                    key={thread.id}
                    thread={thread}
                    onOpen={() => setSelectedId(thread.id)}
                  />
                ))}
              </section>
            )
          })}
        </div>
      )}

      {selected && (
        <ThreadDetailDialog
          key={selected.id}
          workId={workId}
          thread={selected}
          chapters={chapters}
          entries={entries}
          canEdit={canEdit}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedId(null)
          }}
        />
      )}
    </div>
  )
}

function ThreadCardButton({ thread, onOpen }: { thread: ThreadItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-1.5 rounded-sm border border-rule bg-sheet p-3 text-left text-sm outline-none transition-colors hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {/* An overdue thread reads like a finding: a proof-red label and the target underlined. */}
      {thread.overdue && <span className="text-xs font-medium text-mark">회수 목표 지남</span>}
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium break-words break-keep">{thread.title}</span>
        <Badge variant="outline">{IMPORTANCE_LABEL[thread.importance]}</Badge>
      </span>
      {thread.plantedPosition !== null && (
        <span className="text-muted-foreground">심은 회차 {thread.plantedPosition}화</span>
      )}
      {thread.targetChapterPosition !== null && (
        <span
          className={cn(
            'w-fit',
            thread.overdue
              ? 'underline decoration-mark decoration-2 underline-offset-[5px]'
              : 'text-muted-foreground',
          )}
        >
          목표 {thread.targetChapterPosition}화
        </span>
      )}
      {thread.relatedEntries.length > 0 && (
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {thread.relatedEntries.map((entry) => (
            <span key={entry.id}>{entry.name}</span>
          ))}
        </span>
      )}
    </button>
  )
}
