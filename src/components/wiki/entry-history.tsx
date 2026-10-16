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
    return <EmptyState title="아직 변경 이력이 없습니다." />
  }
  return (
    <ol className="flex flex-col divide-y rounded-lg border">
      {changes.map((change) => (
        <li key={change.id} className="flex flex-col gap-1 p-3 text-sm">
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <time dateTime={change.createdAt.toISOString()}>
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
