import { describe, expect, it } from 'vitest'
import { leaderPoints, localBox, matrixPoint, penBox, penStroke } from './proof-geometry'

describe('proof geometry', () => {
  it.each([1, 1.1, 1.25, 1.5])('converts viewport rectangles once at zoom %s', (zoom) => {
    const box = localBox(
      { left: 120 - 12 * zoom, top: 80 + 32 * zoom, width: 55 * zoom, height: 20 * zoom },
      { x: 120, y: 80 },
      { x: zoom, y: zoom },
    )
    expect(box.left).toBeCloseTo(-12)
    expect(box.top).toBeCloseTo(32)
    expect(box.width).toBeCloseTo(55)
    expect(box.height).toBeCloseTo(20)
  })

  it('maps the pen contact through the SVG inverse matrix', () => {
    const viewport = matrixPoint({ a: 1.25, b: 0, c: 0, d: 1.25, e: 110, f: 80 }, { x: 24, y: 16 })
    const contact = matrixPoint({ a: 0.8, b: 0, c: 0, d: 0.8, e: -80, f: -40 }, viewport)
    expect(contact).toEqual({ x: 32, y: 40 })
  })

  it.each(['underline', 'strike'] as const)('includes the round caps in the %s width', (kind) => {
    const stroke = 1.6
    const fragment = { left: 20, top: 30, width: 60, height: 19 }
    const box = penBox(kind, fragment, stroke)
    const pen = penStroke(kind, box.width, box.height, stroke)
    expect(pen.path.split(' ')[0]).toBe('M0.8')
    expect(pen.anchor.x + stroke / 2).toBe(fragment.width)
    expect(pen.path).toMatch(new RegExp(`${pen.anchor.x} ${pen.anchor.y}$`))
  })

  it('puts the ring anchor on its right shoulder', () => {
    const { anchor, path } = penStroke('ring', 50, 26, 1.6)
    expect(path).toContain(` ${anchor.x} ${anchor.y} C`)
    expect(anchor.x).toBe(48)
  })

  const start = { x: 65, y: 20 }
  const end = { x: 220, y: 37 }
  const input = { start, end, lineBottom: 23, gutter: 210, seam: 50, stroke: 1 }

  it('descends below the marked line before crossing to the note column', () => {
    expect(leaderPoints({ ...input, stacked: false })).toEqual([
      start,
      { x: 65, y: 24 },
      { x: 210, y: 24 },
      { x: 210, y: 37 },
      end,
    ])
  })

  it('crosses the seam between panels before continuing along a stacked note', () => {
    const stackedEnd = { x: 16, y: 80 }
    expect(
      leaderPoints({
        ...input,
        end: stackedEnd,
        stacked: true,
        textBelow: [{ left: 10, width: 80 }],
      }).slice(2),
    ).toEqual([
      { x: 210, y: 24 },
      { x: 210, y: 50 },
      { x: 15, y: 50 },
      { x: 15, y: 80 },
      stackedEnd,
    ])
  })

  it('takes the shorter approach when the left edge is clear', () => {
    const end = { x: 16, y: 70 }
    expect(leaderPoints({ ...input, end, stacked: true })).toEqual([
      start,
      { x: 65, y: 24 },
      { x: 15, y: 24 },
      { x: 15, y: 70 },
      end,
    ])
  })
})
