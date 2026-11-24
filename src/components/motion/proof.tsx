'use client'

import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from 'react'
import { cn } from '@/lib/utils'

type ReplayProps = {
  replayKey?: string | number
  delay?: number
}

type NoteProps = ComponentPropsWithoutRef<'span'> & ReplayProps
type PenKind = 'ring' | 'underline' | 'strike'
type Fragment = { left: number; top: number; width: number; height: number }

function penPath(kind: PenKind, width: number, height: number) {
  const x = (fraction: number) => width * fraction
  const y = (fraction: number) => height * fraction
  if (kind === 'ring') {
    return [
      `M${x(0.14)} ${y(0.24)}`,
      `C${x(0.36)} ${y(0.02)} ${x(0.78)} ${y(0.04)} ${x(0.92)} ${y(0.35)}`,
      `C${x(1.03)} ${y(0.61)} ${x(0.83)} ${y(0.89)} ${x(0.52)} ${y(0.91)}`,
      `C${x(0.25)} ${y(0.96)} ${x(0.06)} ${y(0.83)} ${x(0.07)} ${y(0.56)}`,
      `C${x(0.08)} ${y(0.42)} ${x(0.14)} ${y(0.33)} ${x(0.23)} ${y(0.26)}`,
    ].join(' ')
  }
  return `M${x(0.01)} ${y(0.53)} Q${x(0.23)} ${y(0.34)} ${x(0.47)} ${y(0.49)} T${x(0.99)} ${y(0.43)}`
}

function penBox(kind: PenKind, fragment: Fragment): Fragment {
  const { left, top, width, height } = fragment
  if (kind === 'ring') {
    const extra = Math.min(8, width * 0.12)
    return {
      left: left - extra,
      top: top - height * 0.15,
      width: width + extra * 2,
      height: height * 1.3,
    }
  }
  return { left, top: top + height * (kind === 'strike' ? 0.54 : 0.96) - 2, width, height: 4 }
}

function sameFragments(previous: Fragment[], next: Fragment[]) {
  return (
    previous.length === next.length &&
    previous.every(({ left, top, width, height }, index) => {
      const other = next[index]
      return (
        left === other.left && top === other.top && width === other.width && height === other.height
      )
    })
  )
}

function ProofMark({
  kind,
  replayKey,
  delay = 0,
  children,
  className,
  ...props
}: NoteProps & { kind: PenKind }) {
  const node = useRef<HTMLSpanElement>(null)
  const [fragments, setFragments] = useState<Fragment[]>([])
  const standalone = children == null

  useLayoutEffect(() => {
    const element = node.current
    if (!element) return
    let active = true
    function measure() {
      if (!active || !element) return
      const rects = standalone
        ? [element.getBoundingClientRect()]
        : Array.from(element.getClientRects())
      const [origin, ...rest] = rects.filter((rect) => rect.width && rect.height)
      const next = origin
        ? [origin, ...rest].map(({ left, top, width, height }) => ({
            left: left - origin.left,
            top: top - origin.top,
            width,
            height,
          }))
        : []
      setFragments((previous) => (sameFragments(previous, next) ? previous : next))
    }

    measure()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    const layout = standalone ? element : element.parentElement
    if (layout) resize?.observe(layout)
    const fonts = document.fonts
    void fonts?.ready.then(measure)
    fonts?.addEventListener('loadingdone', measure)
    window.addEventListener('resize', measure)
    return () => {
      active = false
      resize?.disconnect()
      fonts?.removeEventListener('loadingdone', measure)
      window.removeEventListener('resize', measure)
    }
  }, [children, standalone])

  const strokes = fragments.length || (!standalone && kind !== 'ring') ? fragments : [null]

  return (
    <span
      {...props}
      ref={node}
      className={cn('wg-proof-mark', className)}
      data-wg-proof={kind}
      data-standalone={standalone}
      data-measured={fragments.length > 0}
      style={{ '--wg-proof-delay': `${delay}ms`, ...props.style } as CSSProperties}
    >
      {standalone || kind === 'ring' ? (
        children
      ) : (
        <span key={replayKey} className="wg-proof-text">
          {children}
        </span>
      )}
      {strokes.map((fragment, index) => {
        const box = fragment ? penBox(kind, fragment) : undefined
        return (
          <svg
            key={String(replayKey) + '-' + index}
            className="wg-proof-pen"
            viewBox={box ? undefined : kind === 'ring' ? '0 0 100 46' : '0 0 100 4'}
            preserveAspectRatio="none"
            aria-hidden="true"
            style={box}
          >
            <path
              pathLength={100}
              d={penPath(kind, box?.width ?? 100, box?.height ?? (kind === 'ring' ? 46 : 4))}
            />
          </svg>
        )
      })}
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
    <span {...props} key={replayKey} className={cn('wg-scan-line', className)} aria-hidden="true">
      {Array.from({ length: 20 }, (_, index) => (
        <span key={index} className="wg-scan-cell" />
      ))}
    </span>
  )
}
