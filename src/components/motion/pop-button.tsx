import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PopOptions = {
  variant?: 'primary' | 'paper' | 'leaf' | 'flat'
  size?: 'default' | 'large'
  pending?: boolean
  pendingLabel?: ReactNode
  arrow?: ReactNode
}

function popClass(variant: PopOptions['variant'] = 'primary', className?: string) {
  return cn(
    'b-button',
    variant === 'primary' && 'b-button--primary',
    variant === 'leaf' && 'b-button--leaf',
    variant === 'flat' ? 'b-button--flat' : 'b-button--shadow',
    className,
  )
}

function PopFace({ children, arrow }: { children: ReactNode; arrow?: ReactNode }) {
  return (
    <>
      <span className="b-button__text">{children}</span>
      <span className="b-button__arrow" aria-hidden="true">
        {arrow ?? (
          <svg
            className="b-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12h15m-6-6 6 6-6 6" />
          </svg>
        )}
      </span>
    </>
  )
}

type PopButtonProps = ComponentProps<'button'> & PopOptions

export function PopButton({
  children,
  arrow,
  className,
  variant,
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
      className={popClass(variant, className)}
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
  variant,
  size,
  disabled,
  pending,
  pendingLabel,
  'aria-label': label,
  ...props
}: PopLinkProps) {
  const face = <PopFace arrow={arrow}>{pending ? (pendingLabel ?? children) : children}</PopFace>
  const classes = popClass(variant, className)
  if (disabled || pending) {
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-busy={pending}
        aria-label={label}
        className={classes}
        data-size={size}
      >
        {face}
      </span>
    )
  }
  return (
    <Link {...props} aria-label={label} className={classes} data-size={size}>
      {face}
    </Link>
  )
}
