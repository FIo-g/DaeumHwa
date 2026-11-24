import { BookOpenIcon, PenLineIcon } from 'lucide-react'

export function PaperStack({ variant = 'book' }: { variant?: 'book' | 'write' }) {
  const Icon = variant === 'book' ? BookOpenIcon : PenLineIcon

  return (
    <div className="b-works-paper-stack b-decor" data-variant={variant} aria-hidden="true">
      <span className="b-works-paper-back b-piece" />
      <span className="b-works-paper-middle b-piece" />
      <span className="b-works-paper-front b-piece">
        <span className="b-works-paper-face b-fade b-scene-run">
          <Icon strokeWidth={1.5} className={variant === 'book' ? 'b-cycle-stamp' : undefined} />
          <span className="b-works-paper-rules" />
        </span>
      </span>
      <span className="b-works-paper-tab b-piece" />
    </div>
  )
}
