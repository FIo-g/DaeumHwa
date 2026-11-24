'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, HistoryIcon, SaveIcon } from 'lucide-react'
import { ChapterPicker } from '@/components/app/chapter-picker'
import { Button, buttonVariants } from '@/components/ui/button'
import type { ChapterStatus } from '@/db/types'
import { CHAPTER_STATUS_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { AutosaveStatus } from '@/lib/client/use-autosave'

export const SAVE_STATUS_TEXT: Record<AutosaveStatus, string> = {
  saved: '저장됨',
  dirty: '저장 안 됨',
  saving: '저장 중…',
  offline: '오프라인: 이 기기에 임시 저장됨',
  conflict: '충돌',
  error: '저장 실패: 이 기기에 임시 저장됨',
}

const STATUS_TONE: Record<AutosaveStatus, string> = {
  saved: 'text-muted-foreground',
  dirty: 'text-muted-foreground',
  saving: 'text-muted-foreground',
  offline: 'text-ink',
  conflict: 'text-ink',
  error: 'text-ink',
}

export type EditorToolbarProps = {
  workId: string
  chapterId: string
  chapters: { id: string; position: number; title: string }[]
  status: AutosaveStatus
  canEdit: boolean
  chapterStatus: ChapterStatus
  onSaveNow(): void
  onStatusChange(status: ChapterStatus): void
  onNavigate(href: string): void
  panelTrigger?: ReactNode
}

/** Save state, chapter switcher, chapter status and the history link above the editor. */
export function EditorToolbar({
  workId,
  chapterId,
  chapters,
  status,
  canEdit,
  chapterStatus,
  onSaveNow,
  onStatusChange,
  onNavigate,
  panelTrigger,
}: EditorToolbarProps) {
  const index = chapters.findIndex((c) => c.id === chapterId)
  const prev = index > 0 ? chapters[index - 1] : undefined
  const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : undefined
  const hrefOf = (id: string) => `/works/${workId}/chapters/${id}`

  return (
    <div className="b-writing-toolbar b-paper flex min-w-0 flex-wrap items-center gap-2 p-2">
      <div className="flex items-center gap-2">
        {canEdit ? (
          <p
            role="status"
            className={cn(
              'b-writing-save-status rounded-full px-2.5 py-1 text-sm font-semibold',
              STATUS_TONE[status],
            )}
          >
            {SAVE_STATUS_TEXT[status]}
          </p>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            보기 전용
          </p>
        )}
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={onSaveNow} disabled={status === 'saving'}>
            <SaveIcon aria-hidden="true" />
            저장
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="이전 회차"
          disabled={!prev}
          onClick={() => prev && onNavigate(hrefOf(prev.id))}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <ChapterPicker
          chapters={chapters}
          value={chapterId}
          onChange={(id) => {
            if (id && id !== chapterId) onNavigate(hrefOf(id))
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="다음 회차"
          disabled={!next}
          onClick={() => next && onNavigate(hrefOf(next.id))}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
        {panelTrigger}
        {canEdit && (
          <div role="group" aria-label="회차 상태" className="flex items-center gap-1">
            {(['draft', 'done'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={chapterStatus === value ? 'default' : 'outline'}
                aria-pressed={chapterStatus === value}
                onClick={() => onStatusChange(value)}
              >
                {value === 'done' && chapterStatus === 'done' && (
                  <CheckIcon aria-hidden="true" className="b-writing-done-stamp" />
                )}
                {CHAPTER_STATUS_LABEL[value]}
              </Button>
            ))}
          </div>
        )}
        <Link
          href={`/works/${workId}/chapters/${chapterId}/history`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <HistoryIcon aria-hidden="true" />
          버전 이력
        </Link>
      </div>
    </div>
  )
}
