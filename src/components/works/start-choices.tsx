import { ArrowUpRightIcon, FileTextIcon, MessageSquareIcon, PenLineIcon } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties } from 'react'

const CHOICES = [
  {
    path: 'interview',
    label: '인터뷰',
    fullLabel: '인터뷰로 설정 정리하기',
    icon: MessageSquareIcon,
  },
  { path: 'import', label: '가져오기', fullLabel: '기존 원고 가져오기', icon: FileTextIcon },
  { path: 'write', label: '바로 쓰기', fullLabel: '바로 쓰기', icon: PenLineIcon },
] as const

export function StartChoices({ workId, created = false }: { workId: string; created?: boolean }) {
  return (
    <ol className="b-works-start-choices">
      {CHOICES.map(({ path, label, fullLabel, icon: Icon }, index) => (
        <li key={path} className="b-works-start-item" style={{ '--b-i': index } as CSSProperties}>
          <Link href={`/works/${workId}/${path}`} className="b-paper b-works-start-card">
            <span className="b-number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="b-works-start-demo b-scene-run" data-demo={path} aria-hidden="true">
              <span className="b-works-demo-slip">
                <Icon strokeWidth={1.5} />
              </span>
              {path === 'interview' && <span className="b-works-demo-index b-cycle-orbit" />}
              <span className="b-works-demo-lines">
                <i />
                <i />
                <i />
              </span>
            </span>
            <span className="b-works-start-label">
              <span className="b-row__title">{created ? fullLabel : label}</span>
              <ArrowUpRightIcon size={20} aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
