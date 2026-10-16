import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Link href={`/works/${id}`} className="block h-full rounded-xl">
      <Card size="sm" className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {genre || '장르 없음'} · {ROLE_LABEL[role]}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-2 px-4 pb-4 text-sm">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            <li>{chapterCount}화</li>
            <li>승인 대기 {pendingCount}</li>
            <li>열린 떡밥 {openThreadCount}</li>
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              최근 수정 {formatKoreanDateTime(lastEditedAt)}
            </span>
            {alertCount > 0 && <Badge variant="destructive">경고 {alertCount}</Badge>}
          </div>
        </div>
      </Card>
    </Link>
  )
}
