import Link from 'next/link'
import type { Role } from '@/db/types'
import { formatKoreanDateTime } from '@/lib/dates'
import { ROLE_LABEL } from '@/lib/labels'

export type WorkCardProps = {
  id: string
  title: string
  genre: string
  role: Role
  chapterCount: number
  pendingCount: number
  openThreadCount: number
  alertCount: number
  lastEditedAt: Date
}

/** One work on the works list: title, counts, warnings and the last edit time. */
export function WorkCard({
  id,
  title,
  genre,
  role,
  chapterCount,
  pendingCount,
  openThreadCount,
  alertCount,
  lastEditedAt,
}: WorkCardProps) {
  return (
    <Link
      href={`/works/${id}`}
      className="flex h-full flex-col gap-3 rounded-sm border border-rule bg-sheet p-4 text-sm outline-none transition-colors hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex flex-col gap-1">
        <span className="font-serif text-base font-semibold break-keep">{title}</span>
        <span className="text-muted-foreground">
          {genre || '장르 없음'} · {ROLE_LABEL[role]}
        </span>
      </span>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <li>{chapterCount}화</li>
        <li>승인 대기 {pendingCount}</li>
        <li>열린 떡밥 {openThreadCount}</li>
      </ul>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          최근 수정 {formatKoreanDateTime(lastEditedAt)}
        </span>
        {alertCount > 0 && (
          <span className="text-xs font-medium text-mark underline decoration-mark/40 underline-offset-4">
            경고 {alertCount}
          </span>
        )}
      </span>
    </Link>
  )
}
