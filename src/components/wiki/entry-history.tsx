import { AiBadge } from '@/components/app/ai-badge'
import { EmptyState } from '@/components/app/empty-state'
import type { ProposerType } from '@/db/types'
import { formatKoreanDateTime } from '@/lib/dates'

export type EntryHistoryItem = {
  id: string
  createdAt: Date
  summary: string
  proposerType: ProposerType
  actorName: string | null
}

/** Change log of one card, newest first, with who made each change (AI or author). */
export function EntryHistory({ changes }: { changes: EntryHistoryItem[] }) {
  if (changes.length === 0) {
    return <EmptyState title="아직 변경 이력이 없어요." />
  }
  return (
    <ol className="wg-wiki-history">
      {changes.map((change, index) => (
        <li key={change.id} className="wg-wiki-history-row text-sm">
          <span className="wg-wiki-line-number" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <time className="font-mono" dateTime={change.createdAt.toISOString()}>
              {formatKoreanDateTime(change.createdAt)}
            </time>
            {change.proposerType === 'ai' ? <AiBadge /> : <span>작가</span>}
          </span>
          <span>{change.summary}</span>
        </li>
      ))}
    </ol>
  )
}
