'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { ChapterPicker } from '@/components/app/chapter-picker'
import { Button, buttonVariants } from '@/components/ui/button'
import type { ChapterStatus } from '@/db/types'
import { CHAPTER_STATUS_LABEL } from '@/lib/labels'
import type { AutosaveStatus } from '@/lib/client/use-autosave'

export const SAVE_STATUS_TEXT: Record<AutosaveStatus, string> = {
  saved: '저장됨',
  dirty: '저장 안 됨',
  saving: '저장 중…',
  offline: '오프라인: 이 기기에 임시 저장됨',
  conflict: '충돌',
  error: '저장 실패: 이 기기에 임시 저장됨',
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
  const [hasChanged, setHasChanged] = useState(false)
  if (canEdit && status !== 'saved' && !hasChanged) setHasChanged(true)

  const index = chapters.findIndex((c) => c.id === chapterId)
  const prev = index > 0 ? chapters[index - 1] : undefined
  const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : undefined
  const hrefOf = (id: string) => `/works/${workId}/chapters/${id}`

  return (
    <div className="wg-writing-toolbar">
      <div className="wg-writing-tool-group">
        <p
          role="status"
          className="wg-writing-save"
          data-state={canEdit ? status : undefined}
          data-changed={hasChanged}
        >
          {canEdit && (
            <span className="wg-writing-save-cell" aria-hidden="true">
              {status === 'saved' && (
                <svg viewBox="0 0 12 12" fill="none">
                  <path d="m2.25 6 2.25 2.25 5-5" pathLength="1" />
                </svg>
              )}
            </span>
          )}
          {canEdit ? SAVE_STATUS_TEXT[status] : '보기 전용'}
        </p>
        {canEdit && (
          <Button
            variant={status === 'dirty' ? 'default' : 'ghost'}
            size="sm"
            onClick={onSaveNow}
            disabled={status === 'saving'}
          >
            저장
          </Button>
        )}
      </div>

      <div className="wg-writing-picker">
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

      <div className="wg-writing-tool-group wg-writing-tool-end">
        {panelTrigger}
        {canEdit && (
          <div
            role="group"
            aria-label="회차 상태"
            className="wg-writing-states"
            data-status={chapterStatus}
          >
            {(['draft', 'done'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant="ghost"
                aria-pressed={chapterStatus === value}
                onClick={() => onStatusChange(value)}
              >
                {CHAPTER_STATUS_LABEL[value]}
              </Button>
            ))}
          </div>
        )}
        <Link
          href={`/works/${workId}/chapters/${chapterId}/history`}
          className={buttonVariants({ variant: 'link', size: 'sm' })}
        >
          버전 이력
        </Link>
      </div>
    </div>
  )
}
