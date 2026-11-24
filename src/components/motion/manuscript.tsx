'use client'

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { useViewportEntrance } from './hooks'
import { leaderPoints, matrixPoint } from './proof-geometry'
import { inverseScreenMatrix, observeProofLayout } from './proof-layout'
import { titleCells, titleRows, type TitleCell } from './title-layout'

type GridTitleProps = {
  /** The title text. One character is set per cell; a space becomes an empty cell. */
  children: string
  as?: 'h1' | 'h2' | 'h3' | 'p'
  /** Cell size: the landing title, a page title inside a work, or a section title. */
  size?: 'hero' | 'page' | 'section'
  /** Cells per row. Left out, the row breaks at spaces to fit the width. */
  columns?: number
  /** Writes the cells in one by one on entry. */
  animate?: boolean
  id?: string
  className?: string
}

const punctuation = /^[.,。、，]$/u

function TitleGlyph({ cell, first = false }: { cell: TitleCell; first?: boolean }) {
  return (
    <span
      className="wg-title-cell"
      data-first={first || undefined}
      data-punctuation={punctuation.test(cell.glyph) || undefined}
      style={{ '--wg-letter': cell.index } as CSSProperties}
    >
      <span className="wg-title-glyph" data-letter={cell.glyph} />
    </span>
  )
}

/** A heading set on manuscript cells. Assistive tech reads the plain text once. */
export function GridTitle({
  children,
  as: Tag = 'h2',
  size = 'section',
  columns,
  animate = true,
  id,
  className,
}: GridTitleProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const cells = useRef<HTMLSpanElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const [fit, setFit] = useState(0)
  const fixed = columns && Number.isFinite(columns) ? Math.max(1, Math.trunc(columns)) : 0
  const usedColumns = fixed || fit
  useViewportEntrance(heading, animate)
  const letters = titleCells(children)
  const rows = usedColumns ? titleRows(letters, usedColumns) : [letters]
  const rowWidth = fixed || Math.min(fit, letters.length)

  useLayoutEffect(() => {
    const area = cells.current
    const cell = probe.current
    if (fixed || !area || !cell) return

    function measure() {
      if (!area || !cell) return
      const width = area.getBoundingClientRect().width
      const cellWidth = cell.getBoundingClientRect().width
      if (width > 0 && cellWidth > 0) setFit(Math.max(1, Math.floor((width + 0.01) / cellWidth)))
    }

    measure()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    resize?.observe(area)
    resize?.observe(cell)
    window.addEventListener('resize', measure)
    return () => {
      resize?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [fixed])

  useLayoutEffect(() => {
    const area = cells.current
    if (!area) return

    const measure = () => {
      for (const glyph of area.querySelectorAll<HTMLElement>('.wg-title-glyph')) {
        const width = glyph.offsetWidth
        const cellWidth = glyph.parentElement?.clientWidth ?? 0
        const inset = Number.parseFloat(getComputedStyle(glyph).getPropertyValue('--b-line')) || 1
        const available = cellWidth - 2 * inset
        if (available > 0 && width > available) {
          glyph.style.setProperty('--wg-glyph-fit', String(available / width))
        } else {
          glyph.style.removeProperty('--wg-glyph-fit')
        }
      }
    }

    return observeProofLayout(area, [area], measure)
  }, [children, rowWidth, usedColumns])

  return (
    <Tag
      ref={heading}
      id={id}
      className={cn('wg-title', className)}
      data-size={size}
      data-animate={animate}
      style={
        {
          '--wg-columns': rowWidth || undefined,
          '--wg-letter-count': Math.max(1, letters.length),
        } as CSSProperties
      }
    >
      <span className="wg-visually-hidden">{children}</span>
      <span ref={cells} className="wg-title-cells" aria-hidden="true">
        <span ref={probe} className="wg-title-probe" />
        <span className="wg-title-grid" data-flow={!usedColumns || undefined}>
          {rows.flatMap((row) => [
            ...row.map((cell, index) => (
              <TitleGlyph key={cell.index} cell={cell} first={index === 0} />
            )),
            ...Array.from({ length: rowWidth - row.length }, (_, index) => (
              <span className="wg-title-cell" key={'blank-' + row[0].index + '-' + index} />
            )),
          ])}
        </span>
      </span>
    </Tag>
  )
}

type SheetProps = {
  children: ReactNode
  as?: ElementType
  /** Sheet name at the top left. */
  label?: ReactNode
  /** Page number at the top right. */
  page?: ReactNode
  /** Draws faint horizontal manuscript rules behind the content. */
  ruled?: boolean
  className?: string
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

/** One sheet of manuscript paper. It replaces cards: rules above and below, no box, no shadow. */
export function Sheet({
  children,
  as: Tag = 'section',
  label,
  page,
  ruled = false,
  className,
  ...rest
}: SheetProps) {
  return (
    <Tag className={cn('wg-sheet', className)} data-ruled={ruled} {...rest}>
      {(label != null || page != null) && (
        <div className="b-edge wg-sheet-edge" aria-hidden="true">
          <span>{label}</span>
          <span>{page}</span>
        </div>
      )}
      {children}
    </Tag>
  )
}

type MarginNoteProps = {
  /** The wiki sentence, quoted verbatim. */
  children: ReactNode
  /** Where it comes from, such as `잿빛 종루 카드에 확정해 둔 설정`. */
  source?: ReactNode
  label?: string
  className?: string
}

/** A wiki quotation written in the margin in fountain-pen blue. Used for wiki quotes only. */
export function MarginNote({ children, source, label = '위키 원문', className }: MarginNoteProps) {
  const ref = useRef<HTMLDivElement>(null)
  useViewportEntrance(ref)

  return (
    <div ref={ref} className={cn('wg-margin-note', className)}>
      <p className="wg-margin-note-label">{label}</p>
      <blockquote className="wg-margin-note-quote">{children}</blockquote>
      {source && <p className="wg-margin-note-source">{source}</p>}
    </div>
  )
}

type ProofPairProps = {
  manuscript: ReactNode
  note: ReactNode
  className?: string
  replayKey?: string | number
}

function textBelow(element: HTMLElement, bottom: number) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  const rects: DOMRect[] = []
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.textContent?.trim() || text.parentElement?.closest('.sr-only, [aria-hidden="true"]'))
      continue
    range.selectNodeContents(text)
    for (const rect of range.getClientRects()) {
      if (rect.width && rect.top >= bottom) rects.push(rect)
    }
  }
  return rects
}

function leaderPath(svg: SVGSVGElement, manuscript: HTMLElement, note: HTMLElement) {
  const inverse = inverseScreenMatrix(svg)
  const mark = manuscript.querySelector<HTMLElement>('[data-wg-proof]')
  const pen = Array.from(mark?.querySelectorAll<SVGPathElement>('[data-pen-x]') ?? []).at(-1)
  const penMatrix = pen?.getScreenCTM?.()
  const line = Array.from(mark?.getClientRects() ?? [])
    .filter((rect) => rect.width && rect.height)
    .at(-1)
  if (!inverse || !mark || !pen || !penMatrix || !line) return ''

  const quote = note.querySelector('.wg-margin-note-quote') ?? note
  const range = document.createRange()
  range.selectNodeContents(quote)
  const target = quote.getBoundingClientRect()
  const text = Array.from(range.getClientRects()).find((rect) => rect.width && rect.height)
  if (!target.width || !target.height) return ''

  const viewportStart = matrixPoint(penMatrix, {
    x: Number(pen.dataset.penX),
    y: Number(pen.dataset.penY),
  })
  const draft = manuscript.getBoundingClientRect()
  const margin = note.getBoundingClientRect()
  const stacked = margin.top >= draft.bottom
  const stroke = Number.parseFloat(getComputedStyle(svg).getPropertyValue('--b-line')) || 1
  const local = (x: number, y: number) => matrixPoint(inverse, { x, y })
  const start = local(viewportStart.x, viewportStart.y)
  const end = local(target.left, text ? text.top + text.height / 2 : target.top + target.height / 2)
  const right = local(draft.right, line.bottom)
  const lowerText = stacked ? textBelow(manuscript, line.bottom) : []
  const lowerEdge = Math.max(draft.bottom, ...lowerText.map((rect) => rect.bottom))
  const points = leaderPoints({
    start,
    end,
    lineBottom: right.y,
    gutter: stacked ? right.x - stroke : Math.min(end.x, (right.x + end.x) / 2),
    stacked,
    seam: local(draft.right, lowerEdge).y,
    stroke,
    textBelow: lowerText.map((rect) => {
      const left = local(rect.left, rect.top).x
      return { left, width: local(rect.right, rect.top).x - left }
    }),
  })
  return points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join('')
}

/** A manuscript sentence and its wiki margin note on one row, joined by a thin leader line. */
export function ProofPair({ manuscript, note, className, replayKey }: ProofPairProps) {
  const row = useRef<HTMLDivElement>(null)
  const draft = useRef<HTMLDivElement>(null)
  const margin = useRef<HTMLDivElement>(null)
  const leader = useRef<SVGSVGElement>(null)
  const [path, setPath] = useState('')
  const [markReplay, setMarkReplay] = useState('')
  useViewportEntrance(row)
  const replay = replayKey ?? markReplay
  const previousReplay = useRef(replay)

  useLayoutEffect(() => {
    const area = row.current
    const left = draft.current
    const right = margin.current
    const svg = leader.current
    if (!area || !left || !right || !svg) return

    return observeProofLayout(
      area,
      [area, left, right],
      () => {
        setPath(leaderPath(svg, left, right))
        setMarkReplay(
          left.querySelector<HTMLElement>('[data-wg-proof]')?.dataset.wgProofReplay ?? '',
        )
      },
      ['data-pen-x', 'data-pen-y', 'data-wg-proof-replay'],
    )
  }, [manuscript, note, replayKey])

  useLayoutEffect(() => {
    if (previousReplay.current === replay) return
    previousReplay.current = replay
    for (const animation of row.current?.getAnimations?.({ subtree: true }) ?? []) {
      if (
        'animationName' in animation &&
        ['wg-note-write', 'wg-leader-draw'].includes(String(animation.animationName))
      ) {
        animation.currentTime = 0
        animation.play()
      }
    }
  }, [replay])

  return (
    <div ref={row} className={cn('wg-proof-pair', className)} data-connected={Boolean(path)}>
      <div ref={draft} className="wg-proof-pair-manuscript">
        {manuscript}
      </div>
      <div ref={margin} className="wg-proof-pair-note">
        {note}
      </div>
      <span className="wg-proof-fallback" aria-hidden="true">
        <span />
      </span>
      <svg ref={leader} className="wg-proof-pair-leader" aria-hidden="true">
        {path && <path d={path} pathLength={1} />}
      </svg>
    </div>
  )
}

type CountCellProps = {
  value: number
  /** Unit written after the number, such as `화` or `건`. */
  unit?: string
  className?: string
}

/** A number in the counting typeface. It counts up once on entry. */
export function CountCell({ value, unit, className }: CountCellProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const animated = Number.isInteger(value) && value !== 0 && Math.abs(value) < 2 ** 31
  useViewportEntrance(ref, animated)

  const final = String(value) + (unit ?? '')
  return (
    <span ref={ref} className={cn('wg-count', className)}>
      <span className="wg-visually-hidden">{final}</span>
      <span className="wg-count-face" data-final={final} aria-hidden="true">
        <span
          className="wg-count-value"
          data-value={value}
          data-count-up={animated || undefined}
          style={animated ? ({ '--wg-count-final': value } as CSSProperties) : undefined}
        />
        {unit && <span className="wg-count-unit">{unit}</span>}
      </span>
    </span>
  )
}
