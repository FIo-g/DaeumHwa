'use client'

import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ProofStrike, ProofUnderline } from '@/components/motion'
import { cn } from '@/lib/utils'
import { segmentText } from './text-ops'
import type { Highlight, ProofRevision } from './types'

/** Both layers need the same type metrics and wrapping for the marks to follow the text. */
export const MANUSCRIPT_TEXT_CLASS = 'wg-writing-text'

export function isProofHighlight(highlight: Highlight) {
  return highlight.kind === 'issue' || highlight.kind === 'naming'
}

type Paint = {
  x: number
  y: number
  width: number
  height: number
  gap: number
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
  const [{ rects, surfaceWidth }, setLayout] = useState<{ rects: Paint[][]; surfaceWidth: number }>(
    {
      rects: [],
      surfaceWidth: 0,
    },
  )
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
      const node = element?.firstChild
      if (!element || !node) return
      const range = document.createRange()
      if (typeof range.getClientRects !== 'function') return
      const root = element.getBoundingClientRect()
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight)
      range.selectNodeContents(element)
      const ink = revision
        ? Array.from(range.getClientRects()).filter((rect) => rect.height > 0)
        : []
      let offset = 0
      const next = segments.map((segment) => {
        const start = offset
        offset += segment.text.length
        if (!segment.kind) return []
        // Splitting the mirror into styled spans can move a soft wrap. Measure ranges in one
        // text node so the browser wraps the same string as it wraps inside the textarea.
        range.setStart(node, start)
        range.setEnd(node, offset)
        return Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0)
          .map((rect) => {
            let top = rect.top
            let gap = 0
            if (segment.id === 'revision') {
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
              x: rect.left - root.left,
              y: top - root.top,
              width: rect.width,
              height: rect.height,
              gap,
            }
          })
      })
      setLayout({ rects: next, surfaceWidth: root.width })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    let disposed = false
    const fonts = document.fonts
    const remeasure = () => {
      if (!disposed) measure()
    }
    void fonts?.ready.then(remeasure)
    fonts?.addEventListener('loadingdone', remeasure)
    return () => {
      disposed = true
      observer?.disconnect()
      fonts?.removeEventListener('loadingdone', remeasure)
    }
  }, [revision, segments])

  const revisionIndex = segments.findIndex((segment) => segment.id === 'revision')
  const revisionRect = rects[revisionIndex]?.[0]

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-transparent">
      <div ref={layer} className={cn(MANUSCRIPT_TEXT_CLASS, 'absolute inset-0 overflow-hidden')}>
        {text}
      </div>
      {segments.map((segment, index) => {
        if (!segment.id || !segment.kind) return null
        const issue = proof.get(segment.id)
        const active = segment.active || segment.id === (linkedId ?? readingId)
        return (
          <mark key={index} data-kind={segment.kind} className="wg-writing-mark">
            <span className="sr-only">{segment.text}</span>
            {segment.id !== 'revision' &&
              rects[index]?.map(({ x, y, width, height }, fragment) => {
                const style = { left: x, top: y, width, height }
                if (issue) {
                  return (
                    <ProofUnderline
                      key={fragment}
                      replayKey={resultKey}
                      delay={resultKey ? Math.min(issue.order ?? 0, 5) * 70 : 0}
                      data-proof-id={issue.id}
                      data-active={active}
                      data-closing={issue.closing}
                      className="wg-writing-proof absolute"
                      style={style}
                    />
                  )
                }
                return (
                  <span
                    key={fragment}
                    data-active={active}
                    className="wg-writing-fragment absolute"
                    style={style}
                  />
                )
              })}
          </mark>
        )
      })}
      {revision && revisionRect && revisionRect.gap > 0 && (
        <RevisionNote
          revision={revision}
          rect={revisionRect}
          textLength={text.length}
          surfaceWidth={surfaceWidth}
        />
      )}
    </div>
  )
})

function RevisionNote({
  revision,
  rect: { x, y, width, gap },
  textLength,
  surfaceWidth,
}: {
  revision: ProofRevision
  rect: Paint
  textLength: number
  surfaceWidth: number
}) {
  const anchor = x + (revision.after ? width / 2 : revision.start === textLength ? width : 0)
  const align = anchor < 64 ? 'start' : surfaceWidth - anchor < 64 ? 'end' : 'center'
  const before = revision.before.replaceAll('\n', ' ')
  const after = revision.after.replaceAll('\n', ' ')
  return (
    <span
      className="wg-writing-revision absolute"
      data-align={align}
      style={
        {
          top: y - gap,
          height: gap,
          '--wg-writing-revision-anchor': `${anchor}px`,
        } as CSSProperties
      }
    >
      <span className="wg-writing-revision-note">
        {before && <ProofStrike>{before}</ProofStrike>}
        {after && <span>{after}</span>}
      </span>
    </span>
  )
}
