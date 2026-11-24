'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'

type DisclosureProps = {
  title: ReactNode
  children: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

export function Disclosure({
  title,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
}: DisclosureProps) {
  const id = useId()
  const [internal, setInternal] = useState(defaultOpen)
  const expanded = open ?? internal

  function toggle() {
    if (open === undefined) setInternal(!expanded)
    onOpenChange?.(!expanded)
  }

  return (
    <div className={className}>
      <button
        id={`${id}-trigger`}
        type="button"
        aria-controls={id}
        aria-expanded={expanded}
        onClick={toggle}
        className="b-row b-disclosure-trigger flex items-center justify-between gap-3 border-b-0"
      >
        <span className="b-row__title">{title}</span>
        <ChevronDownIcon className="b-icon b-chevron" aria-hidden="true" />
        <span className="b-row-rule" aria-hidden="true" />
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className="b-disclosure"
        data-open={expanded}
        inert={!expanded}
        aria-hidden={!expanded}
      >
        {children}
      </div>
    </div>
  )
}
