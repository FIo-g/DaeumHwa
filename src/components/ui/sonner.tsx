'use client'

import { cn } from 'cn'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { CheckIcon, InfoIcon, SlashIcon, TriangleAlertIcon } from 'lucide-react'

const Toaster = ({ className, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      className={cn('wg-ui-toaster group', className)}
      customAriaLabel="알림"
      icons={{
        success: <CheckIcon className="size-4" strokeWidth={1.5} />,
        info: <InfoIcon className="size-4" strokeWidth={1.5} />,
        warning: <TriangleAlertIcon className="size-4" strokeWidth={1.5} />,
        error: <SlashIcon className="size-4" strokeWidth={1.5} />,
        loading: <span aria-hidden="true" className="wg-ui-loading relative block h-2 w-4" />,
      }}
      style={
        {
          '--normal-bg': 'var(--b-paper)',
          '--normal-text': 'var(--b-ink)',
          '--normal-border': 'var(--b-grid)',
          '--border-radius': '0',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
