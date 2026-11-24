import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties } from 'react'

const CHOICES = [
  { path: 'interview', label: '인터뷰', fullLabel: '인터뷰로 설정 정리하기' },
  { path: 'import', label: '가져오기', fullLabel: '기존 원고 가져오기' },
  { path: 'write', label: '바로 쓰기', fullLabel: '바로 쓰기' },
] as const

export function StartChoices({ workId, created = false }: { workId: string; created?: boolean }) {
  return (
    <ol className="wg-works-choices">
      {CHOICES.map(({ path, label, fullLabel }, index) => (
        <li key={path} style={{ '--wg-works-order': index } as CSSProperties}>
          <Link href={`/works/${workId}/${path}`} className="b-row wg-works-choice">
            <span className="b-row__title wg-works-title">{created ? fullLabel : label}</span>
            <ArrowRightIcon
              size={20}
              strokeWidth={1.5}
              className="wg-works-arrow"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ol>
  )
}
