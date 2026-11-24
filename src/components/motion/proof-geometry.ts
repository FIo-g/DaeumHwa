export type Point = { x: number; y: number }
export type Box = { left: number; top: number; width: number; height: number }
export type PenKind = 'ring' | 'underline' | 'strike'

export function matrixPoint(
  { a, b, c, d, e, f }: Pick<DOMMatrixReadOnly, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>,
  { x, y }: Point,
): Point {
  return { x: a * x + c * y + e, y: b * x + d * y + f }
}

export function localBox(rect: Box, origin: Point, scale: Point): Box {
  return {
    left: (rect.left - origin.x) / scale.x,
    top: (rect.top - origin.y) / scale.y,
    width: rect.width / scale.x,
    height: rect.height / scale.y,
  }
}

export function penBox(kind: PenKind, fragment: Box, stroke: number): Box {
  if (kind === 'ring') {
    const extra = Math.min(fragment.height / 3, fragment.width * 0.12)
    return {
      left: fragment.left - extra,
      top: fragment.top - fragment.height * 0.15,
      width: fragment.width + extra * 2,
      height: fragment.height * 1.3,
    }
  }

  const height = stroke * 2
  const baseline = kind === 'strike' ? 0.54 : 1
  return {
    ...fragment,
    top: fragment.top + fragment.height * baseline - height / 2,
    height,
  }
}

export function penStroke(kind: PenKind, width: number, height: number, stroke: number) {
  const x = (fraction: number) => width * fraction
  const y = (fraction: number) => height * fraction

  if (kind === 'ring') {
    const anchor = { x: x(0.96), y: y(0.53) }
    return {
      anchor,
      path: [
        `M${x(0.14)} ${y(0.24)}`,
        `C${x(0.36)} ${y(0.02)} ${anchor.x} ${y(0.04)} ${anchor.x} ${anchor.y}`,
        `C${anchor.x} ${y(0.76)} ${x(0.77)} ${y(0.89)} ${x(0.52)} ${y(0.91)}`,
        `C${x(0.25)} ${y(0.96)} ${x(0.06)} ${y(0.83)} ${x(0.07)} ${y(0.56)}`,
        `C${x(0.08)} ${y(0.42)} ${x(0.14)} ${y(0.33)} ${x(0.23)} ${y(0.26)}`,
      ].join(' '),
    }
  }

  const cap = Math.min(stroke / 2, width / 2)
  const anchor = { x: width - cap, y: y(0.53) }
  return {
    anchor,
    path: `M${cap} ${anchor.y} C${x(0.27)} ${anchor.y} ${x(0.34)} ${y(0.29)} ${x(0.5)} ${y(0.42)} S${x(0.73)} ${anchor.y} ${anchor.x} ${anchor.y}`,
  }
}

export function leaderPoints({
  start,
  end,
  lineBottom,
  gutter,
  stacked,
  seam,
  stroke,
  textBelow = [],
}: {
  start: Point
  end: Point
  lineBottom: number
  gutter: number
  stacked: boolean
  seam: number
  stroke: number
  textBelow?: Pick<Box, 'left' | 'width'>[]
}): Point[] {
  const belowLine = Math.max(start.y, lineBottom + stroke)
  const exit = { x: start.x, y: belowLine }
  const approach = { x: gutter, y: belowLine }
  if (stacked) {
    const edge = end.x - stroke
    const edgeIsClear = !textBelow.some(
      (rect) => rect.left - stroke < edge && edge < rect.left + rect.width + stroke,
    )
    if (edgeIsClear) return [start, exit, { x: edge, y: belowLine }, { x: edge, y: end.y }, end]

    return [
      start,
      exit,
      approach,
      { x: gutter, y: seam },
      { x: edge, y: seam },
      { x: edge, y: end.y },
      end,
    ]
  }
  return [start, exit, approach, { x: gutter, y: end.y }, end]
}
