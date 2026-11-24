import { describe, expect, it } from 'vitest'
import { measureFragments } from './highlight-layer'

describe('measureFragments', () => {
  const frame = {
    left: 240,
    top: 100,
    scale: 1.25,
    scrollLeft: 0,
    scrollTop: 12,
    lineHeight: 40,
  }

  it('keeps each wrapped fragment and subtracts scroll in the editor coordinate system', () => {
    const rects = [
      { left: 260, top: 120, width: 60, height: 25 },
      { left: 250, top: 170, width: 30, height: 25 },
      { left: 280, top: 170, width: 0, height: 25 },
    ]

    expect(measureFragments(rects, frame)).toEqual([
      { x: 16, y: 4, width: 48, height: 20, gap: 0 },
      { x: 8, y: 44, width: 24, height: 20, gap: 0 },
    ])
  })

  it('uses the previous and current glyph boxes to reserve the revision note gap', () => {
    const rect = { left: 260, top: 170, width: 60, height: 25 }
    const ink = [
      { left: 250, top: 116, width: 80, height: 34 },
      { left: 250, top: 165, width: 80, height: 30 },
    ]

    expect(measureFragments([rect], frame, ink)).toEqual([
      { x: 16, y: 40, width: 48, height: 20, gap: 12 },
    ])
  })
})
