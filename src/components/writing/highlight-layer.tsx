'use client'

import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { HandNote, ProofStrike, ProofUnderline } from '@/components/motion'
import { cn } from '@/lib/utils'
import { type LayerSegment, segmentText } from './text-ops'
import type { Highlight, HighlightKind, ProofRevision } from './types'

/** Both layers need the same type metrics and wrapping for the marks to follow the text. */
export const MANUSCRIPT_TEXT_CLASS = 'b-writing-manuscript w-full border-0'

const MARK_CLASS: Record<HighlightKind, string> = {
  issue: '',
  naming: '',
  spelling: 'underline decoration-ink decoration-wavy decoration-1 underline-offset-[6px]',
  comment: 'bg-cream/60',
  reader: 'bg-sand/60',
  search: 'bg-kraft/70',
}

export function isProofHighlight(highlight: Highlight) {
  return highlight.kind === 'issue' || highlight.kind === 'naming'
}

type Paint = {
  id: string
  x: number
  y: number
  width: number
  height: number
  gap: number
  surfaceWidth: number
}

type HighlightLayerProps = {
  text: string
  highlights: Highlight[]
  linkedId?: string | null
  readingId?: string | null
  resultKey?: number
  revision?: ProofRevision | null
}

export const HighlightLayer = memo(function HighlightLayer({
  text,
  highlights,
  linkedId,
  readingId,
  resultKey = 0,
  revision,
}: HighlightLayerProps) {
  const layer = useRef<HTMLDivElement>(null)
  const [rects, setRects] = useState<Paint[]>([])
  const proof = useMemo(
    () => new Map(highlights.filter(isProofHighlight).map((item) => [item.id, item])),
    [highlights],
  )
  const segments = useMemo(() => {
    const revisionEnd = revision && revision.start + revision.after.length
    const anchor =
      revision && text.startsWith(revision.after, revision.start)
        ? [
            {
              id: 'revision',
              kind: 'issue' as const,
              start: Math.min(revision.start, Math.max(0, text.length - 1)),
              end: Math.max(
                revision.start + Number(revision.start < text.length),
                revisionEnd ?? 0,
              ),
            },
          ]
        : []
    return segmentText(text, [
      ...anchor,
      ...proof.values(),
      ...highlights.filter((h) => !isProofHighlight(h)),
    ])
  }, [text, highlights, proof, revision])

  useLayoutEffect(() => {
    const element = layer.current
    if (!element) return
    function measure() {
      if (!element) return
      const root = element.getBoundingClientRect()
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight)
      const textRange = document.createRange()
      const ink: DOMRect[] = []
      if (revision && typeof textRange.getClientRects === 'function') {
        textRange.selectNodeContents(element)
        ink.push(...Array.from(textRange.getClientRects()).filter((rect) => rect.height > 0))
      }
      const next = Array.from(element.querySelectorAll<HTMLElement>('[data-proof-id]')).flatMap(
        (mark) =>
          Array.from(mark.getClientRects(), (rect) => {
            const id = mark.dataset.proofId ?? ''
            let top = rect.top
            let gap = 0
            if (id === 'revision') {
              const rowThreshold = rect.top - lineHeight / 2
              top = Math.min(
                rect.top,
                ...ink.filter((line) => line.top > rowThreshold).map((line) => line.top),
              )
              const previousBottom = Math.max(
                top - Math.max(0, lineHeight - rect.height),
                ...ink.filter((line) => line.top <= rowThreshold).map((line) => line.bottom),
              )
              gap = Math.max(0, Math.floor(top - previousBottom))
            }
            return {
              id,
              x: rect.left - root.left,
              y: top - root.top,
              width: rect.width,
              height: rect.height,
              gap,
              surfaceWidth: root.width,
            }
          }).filter((rect) => rect.width > 0),
      )
      setRects(next)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    let disposed = false
    void document.fonts?.ready.then(() => {
      if (!disposed) measure()
    })
    return () => {
      disposed = true
      observer?.disconnect()
    }
  }, [revision, segments])

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-transparent">
      <div ref={layer} className={cn(MANUSCRIPT_TEXT_CLASS, 'absolute inset-0 overflow-hidden')}>
        {segments.map((segment, index) => (
          <SegmentView
            key={index}
            segment={segment}
            active={segment.id === (linkedId ?? readingId)}
          />
        ))}
      </div>
      {rects.map(({ id, x, y, width, height, gap, surfaceWidth }, index) => {
        const order = proof.get(id)?.order ?? 0
        const position = { left: x, top: y, width, height } as CSSProperties
        if (id === 'revision' && revision) {
          if (!gap || rects.findIndex((rect) => rect.id === 'revision') !== index) return null
          const anchor =
            x + (revision.after ? width / 2 : revision.start === text.length ? width : 0)
          const align = anchor < 64 ? 'start' : surfaceWidth - anchor < 64 ? 'end' : 'center'
          return (
            <span
              key={index}
              className="b-writing-revision absolute"
              data-align={align}
              style={
                {
                  top: y - gap,
                  height: gap,
                  '--b-writing-revision-anchor': `${anchor}px`,
                  '--b-writing-revision-gap': `${gap}px`,
                } as CSSProperties
              }
            >
              <span className="b-writing-revision-note">
                {revision.before.replaceAll('\n', ' ') && (
                  <ProofStrike>{revision.before.replaceAll('\n', ' ')}</ProofStrike>
                )}
                {revision.after && <HandNote>{revision.after.replaceAll('\n', ' ')}</HandNote>}
              </span>
            </span>
          )
        }
        if (!proof.has(id)) return null
        return (
          <ProofUnderline
            key={`${id}-${index}`}
            replayKey={resultKey}
            delay={resultKey ? Math.min(order, 5) * 70 : 0}
            data-existing={resultKey === 0}
            data-closing={proof.get(id)?.closing}
            className="b-writing-proof absolute"
            style={position}
          />
        )
      })}
    </div>
  )
})

function SegmentView({ segment, active }: { segment: LayerSegment; active: boolean }) {
  if (!segment.id || !segment.kind) return <span>{segment.text}</span>
  const proof = segment.kind === 'issue' || segment.kind === 'naming'
  return (
    <mark
      data-kind={segment.kind}
      data-proof-id={proof ? segment.id : undefined}
      data-active={active || segment.active ? 'true' : undefined}
      className={cn('b-writing-mark bg-transparent text-transparent', MARK_CLASS[segment.kind])}
    >
      {segment.text}
    </mark>
  )
}
