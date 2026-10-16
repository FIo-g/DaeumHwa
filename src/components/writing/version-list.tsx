'use client'

import type { VersionSource } from '@/db/types'
import { formatKoreanDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** One saved version of a chapter, without its body. */
export type VersionListEntry = {
  id: string
  version: number
  title: string
  charCount: number
  source: VersionSource
  /** Last save into this row; a coalesced row shows its latest save time. */
  updatedAt: Date
}

export const VERSION_SOURCE_LABEL: Record<VersionSource, string> = {
  save: '저장',
  restore: '복원',
  import: '가져오기',
  ai_draft: 'AI 초안',
}

type VersionListProps = {
  versions: VersionListEntry[]
  currentVersion: number
  selectedId: string | null
  onSelect(id: string): void
}

/** Newest first. Each row is a button, so the list works with the keyboard. */
export function VersionList({ versions, currentVersion, selectedId, onSelect }: VersionListProps) {
  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">저장된 버전이 없습니다.</p>
  }
  return (
    <ul className="flex flex-col gap-1" aria-label="버전 목록">
      {versions.map((v) => {
        const selected = v.id === selectedId
        return (
          <li key={v.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(v.id)}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                selected && 'border-ring bg-muted',
              )}
            >
              <span className="flex flex-wrap items-center gap-2 font-medium">
                버전 {v.version}
                {v.version === currentVersion && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground">
                    현재
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {VERSION_SOURCE_LABEL[v.source]} · {formatKoreanDateTime(v.updatedAt)} · 공백 포함{' '}
                {v.charCount}자
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
