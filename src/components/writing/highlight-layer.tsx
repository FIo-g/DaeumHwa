'use client'

import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { ProofStrike, ProofUnderline } from '@/components/motion'
import { localBox, type Box } from '@/components/motion/proof-geometry'
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

type FragmentFrame = {
  left: number
  top: number
  scale: number
  scrollLeft: number
  scrollTop: number
  lineHeight: number
}

export function measureFragments(rects: Box[], frame: FragmentFrame, ink: Box[] = []): Paint[] {
  const origin = { x: frame.left, y: frame.top }
  const scale = { x: frame.scale, y: frame.scale }
  const toLocal = (rect: Box) => localBox(rect, origin, scale)
  const lines = ink.map(toLocal)

  return rects
    .filter(({ width, height }) => width > 0 && height > 0)
    .map((rect) => {
      const { left, top, width, height } = toLocal(rect)
      let rowTop = top
      let gap = 0
      if (lines.length > 0) {
        const halfLine = frame.lineHeight / 2
        const firstOnRow = top - halfLine
        const nextRow = top + halfLine
        for (const line of lines) {
          if (line.top > firstOnRow && line.top < nextRow) rowTop = Math.min(rowTop, line.top)
        }
        let previousBottom = rowTop - Math.max(0, frame.lineHeight - height)
        for (const line of lines) {
          if (line.top <= firstOnRow)
            previousBottom = Math.max(previousBottom, line.top + line.height)
        }
        gap = rowTop - previousBottom
      }

      return {
        x: left - frame.scrollLeft,
        y: rowTop - frame.scrollTop,
        width,
        height,
        gap,
      }
    })
}

type HighlightLayerProps = {
  mirrorRef: RefObject<HTMLDivElement | null>
  textareaRef: RefObject<HTMLTextAreaElement | null>
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
  mirrorRef,
  textareaRef,
}: HighlightLayerProps) {
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
    const mirror = mirrorRef.current
    const input = textareaRef.current
    if (!mirror || !input) return
    const element = mirror
    const textarea = input

    function measure() {
      const node = element.firstChild
      if (!node || !segments.some(({ kind }) => kind)) {
        setLayout({ rects: [], surfaceWidth: 0 })
        return
      }
      const range = document.createRange()
      if (typeof range.getClientRects !== 'function') return

      const root = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const surfaceWidth = parseFloat(style.width)
      if (!surfaceWidth || !root.width) return
      const frame = {
        left: root.left,
        top: root.top,
        scale: element.currentCSSZoom || root.width / surfaceWidth,
        lineHeight: parseFloat(style.lineHeight),
        scrollLeft: textarea.scrollLeft,
        scrollTop: textarea.scrollTop,
      }
      // A single text node preserves the browser's soft wraps across highlight boundaries.
      range.setStart(node, 0)
      range.setEnd(node, text.length)
      const ink = revision ? Array.from(range.getClientRects()) : []
      let offset = 0
      const next = segments.map((segment) => {
        const start = offset
        offset += segment.text.length
        if (!segment.kind) return []
        range.setStart(node, start)
        range.setEnd(node, offset)
        return measureFragments(
          Array.from(range.getClientRects()),
          frame,
          segment.id === 'revision' ? ink : [],
        )
      })
      setLayout({ rects: next, surfaceWidth })
    }

    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    observer?.observe(textarea)
    textarea.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
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
      textarea.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      fonts?.removeEventListener('loadingdone', remeasure)
    }
  }, [mirrorRef, revision, segments, text, textareaRef])

  const revisionIndex = segments.findIndex((segment) => segment.id === 'revision')
  const revisionRect = rects[revisionIndex]?.[0]

  return (
    <div aria-hidden="true" className="wg-writing-overlay">
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
                      style={
                        {
                          ...style,
                          '--b-pen-stroke': active ? 'var(--b-rule)' : undefined,
                        } as CSSProperties
                      }
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
  const note = useRef<HTMLSpanElement>(null)
  const [noteWidth, setNoteWidth] = useState(0)
  const start = Math.max(0, Math.min(anchor - noteWidth / 2, surfaceWidth - noteWidth))
  const before = revision.before.replaceAll('\n', ' ')
  const after = revision.after.replaceAll('\n', ' ')
  useLayoutEffect(() => {
    const element = note.current
    if (!element) return
    const measure = () => setNoteWidth(parseFloat(getComputedStyle(element).width) || 0)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [after, before])

  return (
    <span
      className="wg-writing-revision absolute"
      style={
        {
          top: y - gap,
          height: gap,
          '--wg-writing-revision-anchor': `${anchor}px`,
          '--wg-writing-revision-start': `${start}px`,
        } as CSSProperties
      }
    >
      <span ref={note} className="wg-writing-revision-note">
        {before && <ProofStrike>{before}</ProofStrike>}
        {after && <span>{after}</span>}
      </span>
    </span>
  )
}
