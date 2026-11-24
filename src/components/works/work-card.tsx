import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import { CountCell } from '@/components/motion'
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
  const trailingParenthesis = title.match(/^(.*\s)(\S+\s+\([^()]+\))$/u)
  return (
    <Link
      href={`/works/${id}`}
      className="b-row wg-works-row"
      aria-label={title}
      aria-describedby={`${description}-meta ${description}-counts ${description}-foot`}
      title={title}
    >
      <div className="wg-works-name">
        <span
          className="b-row__title wg-works-title"
          data-unspaced={!/\s/u.test(title) || undefined}
        >
          {trailingParenthesis ? (
            <>
              {trailingParenthesis[1]}
              <span className="wg-works-title-phrase">{trailingParenthesis[2]}</span>
            </>
          ) : (
            title
          )}
        </span>
        <div className="wg-works-meta" id={`${description}-meta`}>
          <span>{genre || '장르 없음'}</span>
          <span>{ROLE_LABEL[role]}</span>
        </div>
      </div>
      <ul className="wg-works-counts" id={`${description}-counts`}>
        <li>
          <span>회차</span>
          <span className="wg-works-chapter-count font-mono">{chapterCount}화</span>
        </li>
        <li>
          <span>승인 대기</span>
          <CountCell value={pendingCount} />
        </li>
        <li>
          <span>열린 떡밥</span>
          <CountCell value={openThreadCount} />
        </li>
      </ul>
      <div className="wg-works-date" id={`${description}-foot`}>
        <span>
          최근 수정{' '}
          <time dateTime={lastEditedAt.toISOString()}>{formatKoreanDateTime(lastEditedAt)}</time>
        </span>
        {alertCount > 0 && <span className="wg-works-warning">경고 {alertCount}</span>}
      </div>
      <ArrowRightIcon size={20} strokeWidth={1.5} className="wg-works-arrow" aria-hidden="true" />
    </Link>
  )
}
