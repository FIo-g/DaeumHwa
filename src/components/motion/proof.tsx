'use client'

import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from 'react'
import { cn } from '@/lib/utils'
import { localBox, penBox, penStroke, type Box, type PenKind } from './proof-geometry'
import { observeProofLayout } from './proof-layout'

const DEFAULT_PEN_STROKE = 1.6

type ReplayProps = {
  replayKey?: string | number
  delay?: number
}

type NoteProps = ComponentPropsWithoutRef<'span'> & ReplayProps
function sameFragments(previous: Box[], next: Box[]) {
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
  const origin = useRef<SVGSVGElement>(null)
  const [fragments, setFragments] = useState<Box[]>([])
  const [stroke, setStroke] = useState(DEFAULT_PEN_STROKE)
  const lastReplay = useRef(replayKey)
  const standalone = children == null

  useLayoutEffect(() => {
    const element = node.current
    const probe = origin.current
    if (!element || !probe) return

    let layout = element.parentElement
    while (layout && ['inline', 'contents'].includes(getComputedStyle(layout).display)) {
      layout = layout.parentElement
    }

    return observeProofLayout(layout ?? element, [element, layout], () => {
      const matrix = probe.getScreenCTM?.()
      const first = element.getClientRects()[0]
      const scale = matrix
        ? { x: Math.hypot(matrix.a, matrix.b), y: Math.hypot(matrix.c, matrix.d) }
        : { x: 1, y: 1 }
      const viewportOrigin = matrix
        ? { x: matrix.e, y: matrix.f }
        : { x: first?.left ?? 0, y: first?.top ?? 0 }
      const rects = standalone
        ? [element.getBoundingClientRect()]
        : Array.from(element.getClientRects())
      const next =
        scale.x && scale.y
          ? rects
              .filter((rect) => rect.width && rect.height)
              .map((rect) => localBox(rect, viewportOrigin, scale))
          : []
      const token = Number.parseFloat(getComputedStyle(element).getPropertyValue('--b-pen-stroke'))
      setStroke(token > 0 ? token : DEFAULT_PEN_STROKE)
      setFragments((previous) => (sameFragments(previous, next) ? previous : next))
    })
  }, [children, replayKey, standalone])

  useLayoutEffect(() => {
    if (lastReplay.current === replayKey) return
    lastReplay.current = replayKey
    for (const animation of node.current?.getAnimations?.() ?? []) {
      if ('animationName' in animation && animation.animationName === 'wg-pen-draw') {
        animation.currentTime = 0
        animation.play()
      }
    }
  }, [replayKey])

  const strokes = fragments.length || (!standalone && kind !== 'ring') ? fragments : [null]

  return (
    <span
      {...props}
      ref={node}
      className={cn('wg-proof-mark', className)}
      data-wg-proof={kind}
      data-standalone={standalone}
      data-measured={fragments.length > 0}
      data-wg-proof-replay={replayKey}
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
        const box = fragment ? penBox(kind, fragment, stroke) : undefined
        const width = box?.width ?? 100
        const height = box?.height ?? (kind === 'ring' ? 46 : 4)
        const pen = penStroke(kind, width, height, stroke)
        return (
          <svg
            key={String(replayKey) + '-' + index}
            className="wg-proof-pen"
            viewBox={box ? undefined : `0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            style={box}
          >
            <path
              pathLength={100}
              d={pen.path}
              data-pen-x={box ? pen.anchor.x : undefined}
              data-pen-y={box ? pen.anchor.y : undefined}
            />
          </svg>
        )
      })}
      <svg ref={origin} className="wg-proof-origin" aria-hidden="true" />
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
