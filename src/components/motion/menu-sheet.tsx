'use client'

import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { cn } from '@/lib/utils'
import { Stagger } from './stagger'

export function MenuIcon({
  open = false,
  className,
  ...props
}: ComponentPropsWithoutRef<'svg'> & { open?: boolean }) {
  return (
    <svg
      {...props}
      className={cn('wg-motion-icon', className)}
      data-open={open}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1={open ? 6 : 4} x2={open ? 18 : 20} y1={open ? 6 : 9} y2={open ? 18 : 9} />
      <line x1={open ? 6 : 4} x2={open ? 18 : 20} y1={open ? 18 : 15} y2={open ? 6 : 15} />
    </svg>
  )
}

type MenuSheetProps = {
  title: ReactNode
  children: ReactNode
  label?: string
  triggerText?: string
  className?: string
  triggerClassName?: string
  footer?: ReactNode
}

export function MenuSheet({
  title,
  children,
  label = '메뉴 열기',
  triggerText,
  className,
  triggerClassName,
  footer,
}: MenuSheetProps) {
  const [open, setOpen] = useState(false)
  const dismiss = useRef<HTMLButtonElement>(null)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger aria-label={label} className={cn('wg-menu-button', triggerClassName)}>
        <MenuIcon open={open} />
        {triggerText}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="wg-menu-backdrop" />
        <Dialog.Popup initialFocus={dismiss} className={cn('wg-menu-sheet', className)}>
          <div className="wg-menu-header">
            <Dialog.Title className="wg-menu-title">{title}</Dialog.Title>
            <Dialog.Close ref={dismiss} aria-label="메뉴 닫기" className="wg-menu-button">
              <MenuIcon open={open} />
            </Dialog.Close>
          </div>
          <div
            onClick={(event) => {
              const target = event.target
              if (
                target instanceof Element &&
                target.closest('a[href]') &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey
              )
                setOpen(false)
            }}
          >
            <Stagger className="wg-menu-items">{children}</Stagger>
          </div>
          {footer}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
