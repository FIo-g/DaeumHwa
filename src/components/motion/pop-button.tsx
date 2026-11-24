import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PopOptions = {
  variant?: 'primary' | 'paper' | 'sand' | 'flat'
  size?: 'default' | 'large'
  pending?: boolean
  pendingLabel?: ReactNode
  arrow?: ReactNode
}

function PopArrow() {
  return (
    <svg
      className="wg-motion-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  )
}

function PopFace({ children, arrow }: { children: ReactNode; arrow?: ReactNode }) {
  const caption =
    typeof children === 'string' || typeof children === 'number' ? children : undefined

  return (
    <>
      <span className="wg-pop-text">
        {children}
        {caption !== undefined && (
          <span className="wg-pop-text-fill" aria-hidden="true" data-caption={caption} />
        )}
      </span>
      {arrow !== false && (
        <span className="wg-pop-arrow" aria-hidden="true" data-default-arrow={arrow == null}>
          {arrow ?? <PopArrow />}
          {arrow == null && (
            <span className="wg-pop-arrow-fill">
              <PopArrow />
            </span>
          )}
        </span>
      )}
    </>
  )
}

type PopButtonProps = ComponentProps<'button'> & PopOptions

export function PopButton({
  children,
  arrow,
  className,
  variant = 'primary',
  size,
  disabled,
  pending,
  pendingLabel,
  type = 'button',
  ...props
}: PopButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || props['aria-busy']}
      className={cn('wg-pop', className)}
      data-variant={variant}
      data-size={size}
    >
      <PopFace arrow={arrow}>{pending ? (pendingLabel ?? children) : children}</PopFace>
    </button>
  )
}

type PopLinkProps = ComponentProps<typeof Link> & PopOptions & { disabled?: boolean }

export function PopLink({
  children,
  arrow,
  className,
  variant = 'primary',
  size,
  disabled,
  pending,
  pendingLabel,
  'aria-label': label,
  ...props
}: PopLinkProps) {
  const face = <PopFace arrow={arrow}>{pending ? (pendingLabel ?? children) : children}</PopFace>
  const classes = cn('wg-pop', className)
  if (disabled || pending) {
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-busy={pending}
        aria-label={label}
        className={classes}
        data-variant={variant}
        data-size={size}
      >
        {face}
      </span>
    )
  }
  return (
    <Link {...props} aria-label={label} className={classes} data-variant={variant} data-size={size}>
      {face}
    </Link>
  )
}
