'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { useEntered, usePrefersReducedMotion } from './hooks'

/**
 * Manuscript-paper (원고지) primitives. Every screen imports these names, so the names and props
 * below are a fixed contract; only the insides may change.
 */

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

type TitleCell = { glyph: string; index: number }

const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko') : null
const space = /^\s+$/u
const punctuation = /^\p{P}+$/u
const durationPattern = /^([\d.]+)(ms|s)$/

function timeInMilliseconds(value: string, fallback: number) {
  const match = durationPattern.exec(value.trim())
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : fallback
}

function titleGroups(text: string) {
  let offset = 0
  return (text.match(/\s+|\S+/gu) ?? []).map((part) => {
    const letters = graphemes
      ? Array.from(graphemes.segment(part), ({ segment }) => segment)
      : Array.from(part)
    return letters.map((glyph) => ({ glyph: space.test(glyph) ? '' : glyph, index: offset++ }))
  })
}

function titleRows(groups: TitleCell[][], columns: number) {
  const rows: TitleCell[][] = []
  let row: TitleCell[] = []

  for (const group of groups) {
    if (!group[0].glyph) {
      row.push(...group.slice(0, columns - row.length))
      continue
    }
    if (row.length && row.length + group.length > columns) {
      if (row.some((cell) => cell.glyph)) rows.push(row)
      row = []
    }
    for (const cell of group) {
      if (row.length === columns) {
        rows.push(row)
        row = []
      }
      row.push(cell)
    }
  }
  if (row.length) rows.push(row)
  return rows
}

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
  const entered = useEntered(heading, animate && usedColumns > 0)
  const groups = titleGroups(children)
  const glyphCount = groups.reduce((sum, group) => sum + group.length, 0)
  const rows = usedColumns ? titleRows(groups, usedColumns) : []
  const rowWidth = fixed || Math.min(fit, glyphCount)

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

  return (
    <Tag
      ref={heading}
      id={id}
      className={cn('wg-title', className)}
      data-size={size}
      data-animate={animate}
      data-revealed={entered}
      style={
        {
          '--wg-columns': rowWidth || undefined,
          '--wg-letter-count': Math.max(1, glyphCount),
        } as CSSProperties
      }
    >
      <span className="wg-visually-hidden">{children}</span>
      <span ref={cells} className="wg-title-cells" aria-hidden="true">
        <span ref={probe} className="wg-title-probe" />
        {usedColumns ? (
          <span className="wg-title-grid">
            {rows.flatMap((row) => [
              ...row.map((cell, index) => (
                <TitleGlyph key={cell.index} cell={cell} first={index === 0} />
              )),
              ...Array.from({ length: rowWidth - row.length }, (_, index) => (
                <span className="wg-title-cell" key={'blank-' + row[0].index + '-' + index} />
              )),
            ])}
          </span>
        ) : (
          <span className="wg-title-flow">
            {groups.map((group) => (
              <span className="wg-title-word" key={group[0].index}>
                {group.map((cell) => (
                  <TitleGlyph key={cell.index} cell={cell} />
                ))}
              </span>
            ))}
          </span>
        )}
      </span>
    </Tag>
  )
}

type SheetProps = {
  children: ReactNode
  as?: ElementType
  /** Small edge mark at the top left, such as `20×10`. */
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
        <div className="wg-sheet-edge" aria-hidden="true">
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
  const entered = useEntered(ref)

  return (
    <div ref={ref} className={cn('wg-margin-note', className)} data-revealed={entered}>
      <p className="wg-margin-note-label">{label}</p>
      <blockquote className="wg-margin-note-quote">{children}</blockquote>
      {source && <p className="wg-margin-note-source">{source}</p>}
    </div>
  )
}

type ProofPairProps = {
  /** The manuscript side: the sentence with its proof mark. */
  manuscript: ReactNode
  /** The margin side: normally a `MarginNote`. */
  note: ReactNode
  className?: string
}

function leaderPath(area: HTMLElement, manuscript: HTMLElement, note: HTMLElement) {
  const mark = manuscript.querySelector<HTMLElement>('[data-wg-proof]')
  if (!mark) return ''

  const bounds = area.getBoundingClientRect()
  const fragments = Array.from(mark.getClientRects()).filter((rect) => rect.width && rect.height)
  const last = fragments.at(-1)
  if (!bounds.width || !last) return ''

  const quote = note.querySelector('.wg-margin-note-quote') ?? note
  const target = quote.getBoundingClientRect()
  const destination = note.getBoundingClientRect()
  const originX = Math.min(last.right - bounds.left + 2, bounds.width - 1)
  const kind = mark.dataset.wgProof
  const penY = kind === 'strike' ? last.top + last.height / 2 : last.bottom
  const originY = penY - bounds.top
  const endX = Math.max(1, target.left - bounds.left - 3)
  const endY = target.top - bounds.top + Math.min(9, target.height / 2)

  if (destination.top >= manuscript.getBoundingClientRect().bottom - 1) {
    return `M${originX} ${originY}H${endX}V${endY}`
  }
  const elbow = Math.max(originX, endX - 12)
  return `M${originX} ${originY}H${elbow}L${endX} ${endY}`
}

/** A manuscript sentence and its wiki margin note on one row, joined by a thin leader line. */
export function ProofPair({ manuscript, note, className }: ProofPairProps) {
  const row = useRef<HTMLDivElement>(null)
  const draft = useRef<HTMLDivElement>(null)
  const margin = useRef<HTMLDivElement>(null)
  const [path, setPath] = useState('')
  const entered = useEntered(row)

  useLayoutEffect(() => {
    const area = row.current
    const left = draft.current
    const right = margin.current
    if (!area || !left || !right) return
    let active = true
    function measure() {
      if (active && area && left && right) setPath(leaderPath(area, left, right))
    }

    measure()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    resize?.observe(area)
    resize?.observe(left)
    resize?.observe(right)
    const content = new MutationObserver(measure)
    content.observe(left, { childList: true, characterData: true, subtree: true })
    content.observe(right, { childList: true, characterData: true, subtree: true })
    const fonts = document.fonts
    void fonts?.ready.then(measure)
    fonts?.addEventListener('loadingdone', measure)
    window.addEventListener('resize', measure)
    return () => {
      active = false
      resize?.disconnect()
      content.disconnect()
      fonts?.removeEventListener('loadingdone', measure)
      window.removeEventListener('resize', measure)
    }
  }, [manuscript, note])

  return (
    <div
      ref={row}
      className={cn('wg-proof-pair', className)}
      data-revealed={entered}
      data-connected={Boolean(path)}
    >
      <div ref={draft} className="wg-proof-pair-manuscript">
        {manuscript}
      </div>
      <div ref={margin} className="wg-proof-pair-note">
        {note}
      </div>
      {path && (
        <svg className="wg-proof-pair-leader" aria-hidden="true">
          <path d={path} pathLength={1} />
        </svg>
      )}
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
  const number = useRef<HTMLSpanElement>(null)
  const counted = useRef(false)
  const entered = useEntered(ref)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const node = number.current
    if (!entered || reduced || counted.current || !node || !Number.isFinite(value) || value === 0)
      return

    const step = timeInMilliseconds(getComputedStyle(node).getPropertyValue('--b-step'), 260)
    const duration = Math.min(600, step * 2)
    const magnitude = Math.abs(value)
    const smallInteger = Number.isInteger(value) && magnitude <= 20
    const steps = smallInteger ? magnitude : 20
    let start: number | undefined
    let frame = requestAnimationFrame(function tick(now) {
      if (!node) return
      counted.current = true
      start ??= now
      const progress = Math.min(1, (now - start) / duration)
      if (progress >= 1) {
        delete node.dataset.counting
        return
      }
      const level = Math.floor(progress * steps)
      const current = value * (level / steps)
      const display = smallInteger
        ? Math.sign(value) * level
        : Number.isInteger(value)
          ? Math.trunc(current)
          : Number(current.toPrecision(3))
      node.dataset.counting = String(display)
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      delete node.dataset.counting
    }
  }, [entered, reduced, value])

  const final = String(value) + (unit ?? '')
  return (
    <span ref={ref} className={cn('wg-count', className)}>
      <span className="wg-visually-hidden">{final}</span>
      <span className="wg-count-face" data-final={final} aria-hidden="true">
        <span className="wg-count-value" ref={number} data-value={value} />
        {unit && <span className="wg-count-unit">{unit}</span>}
      </span>
    </span>
  )
}
