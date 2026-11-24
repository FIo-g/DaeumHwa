'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const Chevron = expanded ? ChevronUpIcon : ChevronDownIcon

  function toggle() {
    if (open === undefined) setInternal(!expanded)
    onOpenChange?.(!expanded)
  }

  return (
    <div className={cn('wg-disclosure', className)}>
      <button
        id={`${id}-trigger`}
        type="button"
        aria-controls={id}
        aria-expanded={expanded}
        onClick={toggle}
        className="wg-disclosure-trigger"
      >
        <span className="wg-disclosure-title">{title}</span>
        <Chevron className="wg-motion-icon" strokeWidth={1.5} aria-hidden="true" />
        <span className="wg-disclosure-rule" aria-hidden="true" />
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className="wg-disclosure-region"
        data-open={expanded}
        inert={!expanded}
        aria-hidden={!expanded}
      >
        <div className="wg-disclosure-content">{children}</div>
      </div>
    </div>
  )
}
