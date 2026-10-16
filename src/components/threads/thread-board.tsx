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
        <div className="grid gap-4 md:grid-cols-5">
          {COLUMN_STATUSES.map((status) => {
            const items = threads.filter((t) => t.status === status)
            const label = THREAD_STATUS_LABEL[status]
            return (
              <section
                key={status}
                aria-label={label}
                className="flex min-w-0 flex-col gap-2 rounded-xl bg-muted/40 p-3"
              >
                <h2 className="flex items-center justify-between gap-2 px-1 text-sm font-medium">
                  <span data-slot="column-label">{label}</span>
                  <span className="text-muted-foreground">{items.length}</span>
                </h2>
                {items.length === 0 && (
                  <p className="px-1 py-4 text-center text-sm text-muted-foreground">
                    떡밥이 없습니다.
                  </p>
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
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-background p-3 text-left text-sm transition-colors hover:bg-muted',
        thread.overdue && 'border-destructive/50',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="font-medium break-words">{thread.title}</span>
        <Badge variant="outline">{IMPORTANCE_LABEL[thread.importance]}</Badge>
      </span>
      {thread.plantedPosition !== null && (
        <span className="text-muted-foreground">심은 회차 {thread.plantedPosition}화</span>
      )}
      {thread.targetChapterPosition !== null && (
        <span className="text-muted-foreground">목표 {thread.targetChapterPosition}화</span>
      )}
      {thread.relatedEntries.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {thread.relatedEntries.map((entry) => (
            <span key={entry.id} className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
              {entry.name}
            </span>
          ))}
        </span>
      )}
      {thread.overdue && <Badge variant="destructive">회수 목표 지남</Badge>}
    </button>
  )
}
