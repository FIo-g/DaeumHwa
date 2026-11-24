import type { ReactNode } from 'react'
import { GridTitle } from '@/components/motion'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="b-page-header wg-shell-page-header">
      <div className="wg-shell-edge" aria-hidden="true">
        <span>20×10</span>
        <span className="wg-shell-page-mark" />
      </div>
      <div className="wg-shell-heading">
        <GridTitle as="h1" size="page" className="wg-shell-title">
          {title}
        </GridTitle>
        {description && <p className="wg-shell-description">{description}</p>}
      </div>
      {actions && <div className="wg-shell-actions">{actions}</div>}
    </header>
  )
}
