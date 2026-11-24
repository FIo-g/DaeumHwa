'use client'

import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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
      className={cn('b-icon b-menu-icon', open && 'b-menu-icon--close', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1={4} x2={20} y1={9} y2={9} />
      <line x1={4} x2={20} y1={15} y2={15} />
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={label}
        render={
          <Button
            variant="outline"
            size={triggerText ? 'default' : 'icon'}
            className={triggerClassName}
          />
        }
      >
        <MenuIcon open={open} />
        {triggerText}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        initialFocus={dismiss}
        className={cn(
          'b-menu-sheet mx-auto max-h-[80dvh] max-w-[34rem] overflow-y-auto p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <SheetTitle className="b-subhead min-w-0 wrap-anywhere break-keep">{title}</SheetTitle>
          <SheetClose
            ref={dismiss}
            aria-label="메뉴 닫기"
            render={<Button variant="outline" size="icon" />}
          >
            <MenuIcon open={open} />
          </SheetClose>
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
          <Stagger className="gap-2">{children}</Stagger>
        </div>
        {footer}
      </SheetContent>
    </Sheet>
  )
}
