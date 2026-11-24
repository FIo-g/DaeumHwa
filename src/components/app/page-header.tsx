import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  band?: 'mustard' | 'leaf' | 'apricot' | 'paper'
}

export function PageHeader({ title, description, actions, band = 'paper' }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'b-page-header flex min-w-0 flex-wrap items-start justify-between gap-4 pb-6',
        band !== 'paper' &&
          `b-band b-band--${band} b-band--app mb-6 rounded-card border-2 border-ink px-app`,
      )}
    >
      <div className="b-route-heading flex min-w-0 flex-1 basis-64 flex-col gap-2">
        <h1 className="b-title min-w-0 wrap-anywhere break-keep">{title}</h1>
        {description && (
          <p className="b-lede wrap-anywhere break-keep text-muted-ink">{description}</p>
        )}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
