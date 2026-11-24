import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="wg-shell-empty">
      <div className="wg-shell-empty-cells" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <p className="b-subhead">{title}</p>
      {description && <p className="wg-shell-description">{description}</p>}
      {action}
    </div>
  )
}
