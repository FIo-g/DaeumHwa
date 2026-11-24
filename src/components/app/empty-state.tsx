import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="b-paper flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="b-decor b-piece relative mb-2 size-12" aria-hidden="true">
        <div className="absolute inset-1 rotate-[-9deg] rounded-field border-2 border-ink bg-kraft" />
        <div className="absolute inset-1 translate-x-1 translate-y-1 rotate-6 rounded-field border-2 border-ink bg-paper" />
      </div>
      <p className="b-subhead">{title}</p>
      {description && (
        <p className="b-label max-w-prose wrap-anywhere break-keep text-muted-ink">{description}</p>
      )}
      {action}
    </div>
  )
}
