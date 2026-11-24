import type { ComponentPropsWithoutRef, CSSProperties } from 'react'
import { cn } from '@/lib/utils'

type ReplayProps = {
  replayKey?: string | number
  delay?: number
}

type NoteProps = ComponentPropsWithoutRef<'span'> & ReplayProps

export function HandNote({ replayKey, delay = 0, className, children, ...props }: NoteProps) {
  return (
    <span {...props} className={cn('b-hand b-scene-run', className)}>
      <span
        key={replayKey}
        className="b-hand-write"
        style={{ '--b-delay': `${delay}ms` } as CSSProperties}
      >
        {children}
      </span>
    </span>
  )
}

function ProofMark({
  kind,
  replayKey,
  delay = 0,
  children,
  className,
  ...props
}: NoteProps & { kind: 'ring' | 'underline' | 'strike' }) {
  return (
    <span {...props} className={cn('b-proof-word b-scene-run', className)}>
      {children}
      <svg
        key={replayKey}
        className={
          kind === 'ring'
            ? 'b-mark-ring'
            : cn('b-proof-ink', kind === 'strike' && 'b-proof-ink--strike')
        }
        viewBox={kind === 'ring' ? '0 0 100 46' : '0 0 100 4'}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ '--b-delay': `${delay}ms` } as CSSProperties}
      >
        <path
          pathLength={100}
          d={
            kind === 'ring'
              ? 'M14 11 C36 1 78 2 92 16 C103 28 83 41 52 42 C25 44 6 38 7 26 C8 19 14 15 23 12'
              : 'M1 2 L99 2'
          }
        />
      </svg>
    </span>
  )
}

export function ProofRing(props: NoteProps) {
  return <ProofMark kind="ring" {...props} />
}

export function ProofUnderline(props: NoteProps) {
  return <ProofMark kind="underline" {...props} />
}

export function ProofStrike(props: NoteProps) {
  return <ProofMark kind="strike" {...props} />
}

export function ScanLine({
  replayKey,
  active = true,
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<'span'>, 'children'> &
  Omit<ReplayProps, 'delay'> & { active?: boolean }) {
  if (!active) return null
  return (
    <span {...props} key={replayKey} className={cn('b-scan-line', className)} aria-hidden="true" />
  )
}
