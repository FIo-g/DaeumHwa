import type { Css } from 'cytoscape'
import type { EntryKind } from '@/db/types'

export const GRAPH_COLOR_TOKENS = {
  ink: '--b-ink',
  paper: '--b-paper',
  grid: '--b-grid',
} as const

export type GraphPalette = Record<keyof typeof GRAPH_COLOR_TOKENS, string>

export function readGraphPalette(
  element: Element,
  context?: CanvasRenderingContext2D | null,
): GraphPalette {
  const computed = getComputedStyle(element)

  function read(role: keyof GraphPalette, fallback: string) {
    const color = computed.getPropertyValue(GRAPH_COLOR_TOKENS[role]).trim() || fallback
    if (!context) return color

    // The renderer accepts sRGB, so resolve CSS color functions through a single pixel.
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = fallback
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
    return alpha ? `rgb(${red}, ${green}, ${blue})` : fallback
  }

  return {
    ink: read('ink', computed.color),
    paper: read('paper', computed.backgroundColor),
    grid: read('grid', computed.borderBlockStartColor),
  }
}

export function readGraphFont(element: Element): string {
  const font = getComputedStyle(element).getPropertyValue('--b-font-body')
  return font.replace(/'/g, '"').replace(/\s+/g, ' ').trim() || 'sans-serif'
}

export type KindShape = 'circle' | 'square' | 'diamond' | 'hexagon' | 'triangle'
export type KindMark = { shape: KindShape; filled: boolean }

export const ENTRY_KIND_MARK: Record<EntryKind, KindMark> = {
  character: { shape: 'circle', filled: true },
  place: { shape: 'square', filled: true },
  organization: { shape: 'hexagon', filled: false },
  item: { shape: 'diamond', filled: true },
  rule: { shape: 'square', filled: false },
  event: { shape: 'triangle', filled: false },
  term: { shape: 'diamond', filled: false },
  other: { shape: 'circle', filled: false },
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
  ink: string,
  paper: string,
  lineWidth: number,
): void {
  const { shape, filled } = ENTRY_KIND_MARK[kind]
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

export function readGraphTiming(element: Element) {
  const style = getComputedStyle(element)
  function milliseconds(token: string, fallback: number) {
    const duration = style.getPropertyValue(token).trim()
    const value = Number.parseFloat(duration)
    if (!Number.isFinite(value)) return fallback
    return duration.endsWith('ms') ? value : value * 1000
  }

  return {
    step: milliseconds('--b-step', 260),
    easing: (style.getPropertyValue('--b-out').trim() ||
      'ease-out') as Css.TransitionTimingFunction,
  }
}
