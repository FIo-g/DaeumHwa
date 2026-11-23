import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ProofCircleProps = {
  children: ReactNode
  /** Draw the circle (and leader) once on load. Only the first-screen mark animates. */
  animate?: boolean
  /** A proof-red guide line from the circle to the margin note, on wide screens only. */
  leader?: boolean
  className?: string
}

/**
 * Words circled the way an editor circles them on a proof. The row that holds it must clip
 * horizontally (`overflow-x-clip`) so the leader stops at the sheet edge, and the margin note
 * sits above the leader on the sheet colour.
 */
export function ProofCircle({
  children,
  animate = false,
  leader = false,
  className,
}: ProofCircleProps) {
  return (
    <span
      data-proof-anchor={leader ? '' : undefined}
      className={cn('relative inline-block leading-[1.35]', className)}
    >
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="pointer-events-none absolute top-[-0.22em] left-[-0.42em] h-[calc(100%+0.44em)] w-[calc(100%+0.84em)] overflow-visible text-mark"
      >
        <path
          d="M56 3C83 2 99 9 98 20C97 32 75 38 48 38C20 38 2 31 3 20C4 9 25 3 51 4C63 4 71 6 76 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          className={animate ? 'proof-stroke' : undefined}
        />
      </svg>
      {leader && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-[-0.22em] left-[calc(100%+0.3em)] hidden h-[1.5px] w-[70vw] origin-left bg-mark lg:block',
            animate && 'proof-reach',
          )}
        />
      )}
    </span>
  )
}
