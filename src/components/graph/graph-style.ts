import type { EntryKind } from '@/db/types'

// One look for every relationship graph renderer (cytoscape, force-graph 2D and 3D, the chips).
// Canvas renderers cannot read CSS variables, so the DESIGN.md inks are repeated here.
export const GRAPH_INK = {
  graphite: '#2b2d2c',
  muted: '#565b58',
  pencil: '#8f9591',
  rule: '#c9cdc8',
  sheet: '#fafbf9',
  /** Blue pencil: only for the selected card or relation (focus). */
  canon: '#2f5d9e',
} as const

/** Relations are plain pencil lines; their kind is written on the line, not coded by hue. */
export const RELATION_INK = GRAPH_INK.pencil

export const GRAPH_FONT =
  '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif'

export type KindShape = 'circle' | 'square' | 'diamond' | 'hexagon' | 'triangle'
export type KindMark = { shape: KindShape; ink: string; filled: boolean }

/**
 * Card kinds read without hue: the shape first, then a filled or outlined mark, then graphite,
 * muted or pencil grey. Proof red and blue pencil keep their own jobs (errors; canon and focus).
 */
export const ENTRY_KIND_MARK: Record<EntryKind, KindMark> = {
  character: { shape: 'circle', ink: GRAPH_INK.graphite, filled: true },
  place: { shape: 'square', ink: GRAPH_INK.muted, filled: true },
  organization: { shape: 'hexagon', ink: GRAPH_INK.graphite, filled: false },
  item: { shape: 'diamond', ink: GRAPH_INK.pencil, filled: true },
  rule: { shape: 'square', ink: GRAPH_INK.muted, filled: false },
  event: { shape: 'triangle', ink: GRAPH_INK.graphite, filled: false },
  term: { shape: 'diamond', ink: GRAPH_INK.muted, filled: false },
  other: { shape: 'circle', ink: GRAPH_INK.pencil, filled: false },
}

/** Outline points of a shape centred on (x, y) that fits a circle of radius r. */
export function kindShapePoints(
  shape: Exclude<KindShape, 'circle'>,
  x: number,
  y: number,
  r: number,
): [number, number][] {
  switch (shape) {
    case 'square': {
      const s = r * 0.86
      return [
        [x - s, y - s],
        [x + s, y - s],
        [x + s, y + s],
        [x - s, y + s],
      ]
    }
    case 'diamond':
      return [
        [x, y - r * 1.1],
        [x + r * 1.1, y],
        [x, y + r * 1.1],
        [x - r * 1.1, y],
      ]
    case 'triangle':
      return [
        [x, y - r * 1.1],
        [x + r * 1.05, y + r * 0.8],
        [x - r * 1.05, y + r * 0.8],
      ]
    case 'hexagon':
      return Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 3) * i
        return [x + r * Math.cos(angle), y + r * Math.sin(angle)] as [number, number]
      })
  }
}

/** Draws the kind's mark on a canvas. Outlined marks are filled with the paper colour first. */
export function drawKindMark(
  context: CanvasRenderingContext2D,
  kind: EntryKind,
  x: number,
  y: number,
  r: number,
  paper: string,
  lineWidth: number,
): void {
  const { shape, ink, filled } = ENTRY_KIND_MARK[kind]
  // Keep outlined marks the same outer size as filled ones.
  const radius = filled ? r : r - lineWidth / 2
  context.beginPath()
  if (shape === 'circle') {
    context.arc(x, y, radius, 0, Math.PI * 2)
  } else {
    const [first, ...rest] = kindShapePoints(shape, x, y, radius)
    context.moveTo(first[0], first[1])
    for (const [px, py] of rest) context.lineTo(px, py)
    context.closePath()
  }
  context.fillStyle = filled ? ink : paper
  context.fill()
  if (!filled) {
    context.lineWidth = lineWidth
    context.lineJoin = 'round'
    context.strokeStyle = ink
    context.stroke()
  }
}
