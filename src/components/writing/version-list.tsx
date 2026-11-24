'use client'

import type { CSSProperties } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import type { VersionSource } from '@/db/types'
import { formatKoreanDateTime } from '@/lib/dates'

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
    return <EmptyState title="저장된 버전이 없어요." />
  }
  return (
    <ul className="wg-chapters-versions" aria-label="버전 목록">
      {versions.map((v, index) => {
        const selected = v.id === selectedId
        return (
          <li
            key={v.id}
            className="wg-chapters-version-row"
            style={{ '--wg-chapters-row': Math.min(index, 4) } as CSSProperties}
          >
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(v.id)}
              className="wg-chapters-version-button"
            >
              <span className="wg-chapters-version-heading flex flex-wrap items-baseline gap-x-2">
                <span className="wg-chapters-version-label font-medium">
                  버전 <span className="font-mono">{v.version}</span>
                </span>
                {v.version === currentVersion && (
                  <span className="text-xs text-muted-ink">현재</span>
                )}
              </span>
              <span className="text-xs leading-relaxed text-muted-ink">
                {VERSION_SOURCE_LABEL[v.source]} ·{' '}
                <time className="font-mono whitespace-nowrap" dateTime={v.updatedAt.toISOString()}>
                  {formatKoreanDateTime(v.updatedAt)}
                </time>
                {' · '}
                <span className="whitespace-nowrap">
                  공백 포함 <span className="font-mono">{v.charCount}자</span>
                </span>
              </span>
            </button>
            <span className="wg-chapters-line-number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
