import { ArrowUpRightIcon } from 'lucide-react'
import Link from 'next/link'
import { HandNote, TiltCard } from '@/components/motion'
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
  const description = `work-card-${id}`
  return (
    <TiltCard pointer={false} className="b-works-book">
      <Link
        href={`/works/${id}`}
        className="b-works-book-link"
        aria-label={title}
        aria-describedby={`${description}-meta ${description}-counts ${description}-foot`}
        title={title}
      >
        <div className="b-works-book-head">
          <div className="b-works-book-meta" id={`${description}-meta`}>
            <div className="flex min-w-0 flex-wrap gap-2">
              <span className="b-works-tag">{genre || '장르 없음'}</span>
              <span className="b-works-tag">{ROLE_LABEL[role]}</span>
            </div>
            <ArrowUpRightIcon className="b-works-book-arrow" aria-hidden="true" />
          </div>
          <span className="b-heading b-works-book-title">{title}</span>
        </div>
        <ul className="b-works-book-counts" id={`${description}-counts`}>
          <li>
            <span>회차</span>
            <strong>
              {chapterCount}
              <small>화</small>
            </strong>
          </li>
          <li>
            <span>승인 대기</span>
            <strong>{pendingCount}</strong>
          </li>
          <li>
            <span>열린 떡밥</span>
            <strong>{openThreadCount}</strong>
          </li>
        </ul>
        <div className="b-works-book-foot" id={`${description}-foot`}>
          <span className="b-label text-muted-ink">
            최근 수정{' '}
            <time dateTime={lastEditedAt.toISOString()}>{formatKoreanDateTime(lastEditedAt)}</time>
          </span>
          {alertCount > 0 && <HandNote className="b-works-warning">경고 {alertCount}</HandNote>}
        </div>
      </Link>
    </TiltCard>
  )
}
