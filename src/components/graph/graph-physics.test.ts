import { describe, expect, it } from 'vitest'
import { hoverScale, ORIGIN, settled, stepPhysics, type PhysicsNode } from './graph-physics'

const bounds = { width: 600, height: 400 }

function node(id: string, x: number): PhysicsNode {
  return { id, home: { x, y: 160 }, halfSize: { x: 24, y: 14 }, offset: ORIGIN, velocity: ORIGIN }
}

describe('relationship springs', () => {
  it('overshoots the resting position and converges in under 1.2 seconds', () => {
    let nodes = [{ ...node('a', 220), offset: { x: 100, y: -40 } }]
    let overshot = false
    for (let frame = 0; frame < 144; frame++) {
      nodes = stepPhysics(nodes, { bounds, springs: [] })
      overshot ||= nodes[0].offset.x < 0
    }
    expect(overshot).toBe(true)
    expect(settled(nodes[0])).toBe(true)
  })

  it('moves linked nodes during a drag and settles after the held force is removed', () => {
    const springs = [{ source: 'a', target: 'b' }]
    let nodes = [node('a', 100), node('b', 360), node('c', 475)]
    for (let frame = 0; frame < 50; frame++) {
      nodes = stepPhysics(nodes, {
        bounds,
        springs,
        grabbed: { id: 'a', offset: { x: 150, y: 0 } },
      })
    }
    expect(nodes[1].offset.x).toBeGreaterThan(12)
    expect(nodes[2].offset).toEqual(ORIGIN)
    nodes[0] = { ...node('a', 250), velocity: { x: 160, y: 0 } }
    const peak = nodes[1].offset.x
    for (let frame = 0; frame < 144; frame++) {
      nodes = stepPhysics(nodes, { bounds, springs })
    }
    expect(peak).toBeGreaterThan(12)
    expect(nodes.every(settled)).toBe(true)
  })

  it('limits cursor repulsion to four pixels and leaves a node under the pointer in place', () => {
    let nodes = [node('a', 220), node('b', 250)]
    for (let frame = 0; frame < 120; frame++) {
      nodes = stepPhysics(nodes, { bounds, springs: [], cursor: { x: 220, y: 160 } })
      expect(nodes[0].offset).toEqual(ORIGIN)
      expect(Math.abs(nodes[1].offset.x)).toBeLessThan(4)
    }
    expect(nodes[1].offset.x).toBeGreaterThan(0)
  })

  it('keeps a bouncing node inside the canvas and leaves an off-screen home alone', () => {
    const inside = { ...node('a', 572), velocity: { x: 800, y: 0 } }
    const outside = node('b', 660)
    const [a, b] = stepPhysics([inside, outside], { bounds, springs: [] })
    expect(a.home.x + a.offset.x + a.halfSize.x).toBeLessThan(bounds.width)
    expect(a.velocity.x).toBeLessThan(0)
    expect(b.offset).toEqual(ORIGIN)
  })

  it('skips all simulated offsets and velocities under reduced motion', () => {
    const nodes = [{ ...node('a', 220), offset: { x: 30, y: 1 }, velocity: { x: 100, y: 1 } }]
    expect(
      stepPhysics(nodes, {
        bounds,
        springs: [],
        grabbed: { id: 'a', offset: { x: 150, y: 0 } },
        cursor: { x: 270, y: 160 },
        reduced: true,
      }),
    ).toEqual([node('a', 220)])
  })

  it('keeps the hover pulse between six and eight percent and ends by 0.35 seconds', () => {
    const samples = Array.from({ length: 35 }, (_, index) => hoverScale(index / 100))
    expect(Math.max(...samples)).toBeGreaterThan(1.06)
    expect(Math.max(...samples)).toBeLessThan(1.08)
    expect(samples.some((scale) => scale < 1)).toBe(true)
    expect(hoverScale(0.35)).toBe(1)
  })
})
