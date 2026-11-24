import type { ComponentProps, ReactNode } from 'react'
import { GridTitle } from '@/components/motion'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageEdge({
  className,
  showPageMark = true,
}: {
  className?: string
  showPageMark?: boolean
}) {
  return (
    <div className={cn('b-edge wg-shell-edge', className)} aria-hidden="true">
      <span>20×10</span>
      {showPageMark && <span className="wg-shell-page-mark" />}
    </div>
  )
}

export function PageHeaderFrame({ className, children, ...props }: ComponentProps<'header'>) {
  return (
    <header {...props} className={cn('b-page-header wg-shell-page-header', className)}>
      {children}
    </header>
  )
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <PageHeaderFrame>
      <PageEdge />
      <div className="wg-shell-heading">
        <GridTitle as="h1" size="page" className="wg-shell-title">
          {title}
        </GridTitle>
        {description && <p className="wg-shell-description">{description}</p>}
      </div>
      {actions && <div className="wg-shell-actions">{actions}</div>}
    </PageHeaderFrame>
  )
}
