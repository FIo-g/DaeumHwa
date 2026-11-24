export type Point = { x: number; y: number }

export type PhysicsNode = {
  id: string
  home: Point
  offset: Point
  velocity: Point
  halfSize: Point
}

type Spring = { source: string; target: string }
type Bounds = { width: number; height: number }

export const ORIGIN: Point = { x: 0, y: 0 }
export const PHYSICS_STEP = 1 / 120
export const SETTLE_LIMIT = 1.1
export const HOVER_DURATION = 0.31

const HOME_SPRING = 145
const LINK_SPRING = 23
const DAMPING = 18
const REPULSION_RADIUS = 44
const REPULSION_STRENGTH = 11
const CURSOR_RADIUS = 60

type PhysicsOptions = {
  springs: readonly Spring[]
  bounds: Bounds
  grabbed?: { id: string; offset: Point }
  cursor?: Point
  reduced?: boolean
}

export function hoverScale(age: number): number {
  if (age < 0 || age >= HOVER_DURATION) return 1
  const fade = Math.min(1, (HOVER_DURATION - age) / 0.06)
  return 1 + 0.123 * Math.exp(-8 * age) * Math.sin(20 * age) * fade
}

export function settled(node: PhysicsNode): boolean {
  return (
    Math.hypot(node.offset.x, node.offset.y) < 0.08 &&
    Math.hypot(node.velocity.x, node.velocity.y) < 0.75
  )
}

export function clampNode(point: Point, halfSize: Point, bounds: Bounds): Point {
  function clamp(value: number, margin: number, size: number) {
    const inset = Math.min(margin + 2, size / 2)
    return Math.min(size - inset, Math.max(inset, value))
  }

  return {
    x: clamp(point.x, halfSize.x, bounds.width),
    y: clamp(point.y, halfSize.y, bounds.height),
  }
}

export function stepPhysics(nodes: readonly PhysicsNode[], options: PhysicsOptions): PhysicsNode[] {
  if (options.reduced) return nodes.map((node) => ({ ...node, offset: ORIGIN, velocity: ORIGIN }))

  const { springs, grabbed, bounds, cursor } = options
  const byId = new Map(nodes.map((node, index) => [node.id, index]))
  const offsets = nodes.map((node) => (node.id === grabbed?.id ? grabbed.offset : node.offset))
  const forces = offsets.map(() => ({ x: 0, y: 0 }))
  const degree = nodes.map(() => 0)

  for (const { source, target } of springs) {
    const a = byId.get(source)
    const b = byId.get(target)
    if (a === undefined || b === undefined || a === b) continue
    const x = (offsets[b].x - offsets[a].x) * LINK_SPRING
    const y = (offsets[b].y - offsets[a].y) * LINK_SPRING
    forces[a].x += x
    forces[a].y += y
    forces[b].x -= x
    forces[b].y -= y
    degree[a]++
    degree[b]++
  }

  const positions = nodes.map(({ home }, index) => ({
    x: home.x + offsets[index].x,
    y: home.y + offsets[index].y,
  }))
  addRepulsion(nodes, positions, forces)

  return nodes.map((node, index) => {
    const offset = offsets[index]
    if (node.id === grabbed?.id) return { ...node, offset, velocity: ORIGIN }

    const target = cursor ? cursorOffset(node, positions[index], cursor) : ORIGIN
    const velocity = {
      x:
        node.velocity.x +
        (forces[index].x / Math.max(1, degree[index]) -
          (offset.x - target.x) * HOME_SPRING -
          node.velocity.x * DAMPING) *
          PHYSICS_STEP,
      y:
        node.velocity.y +
        (forces[index].y / Math.max(1, degree[index]) -
          (offset.y - target.y) * HOME_SPRING -
          node.velocity.y * DAMPING) *
          PHYSICS_STEP,
    }
    const point = {
      x: positions[index].x + velocity.x * PHYSICS_STEP,
      y: positions[index].y + velocity.y * PHYSICS_STEP,
    }
    const nearEdge = clampNode(ORIGIN, node.halfSize, bounds)
    const farEdge = clampNode({ x: bounds.width, y: bounds.height }, node.halfSize, bounds)
    for (const axis of ['x', 'y'] as const) {
      // A pan can deliberately put home beyond the viewport. Do not pull those nodes inside.
      const min = Math.min(nearEdge[axis], node.home[axis])
      const max = Math.max(farEdge[axis], node.home[axis])
      const clamped = Math.min(max, Math.max(min, point[axis]))
      if (clamped !== point[axis]) velocity[axis] *= -0.2
      point[axis] = clamped
    }

    return {
      ...node,
      offset: { x: point.x - node.home.x, y: point.y - node.home.y },
      velocity,
    }
  })
}

function cursorOffset(node: PhysicsNode, position: Point, cursor: Point): Point {
  const dx = node.home.x - cursor.x
  const dy = node.home.y - cursor.y
  const distance = Math.hypot(dx, dy)
  if (
    distance === 0 ||
    distance >= CURSOR_RADIUS ||
    (Math.abs(position.x - cursor.x) < node.halfSize.x &&
      Math.abs(position.y - cursor.y) < node.halfSize.y)
  )
    return ORIGIN

  const push = 3.7 * (1 - distance / CURSOR_RADIUS) ** 2
  return { x: (dx / distance) * push, y: (dy / distance) * push }
}

function addRepulsion(nodes: readonly PhysicsNode[], positions: Point[], forces: Point[]) {
  const buckets = new Map<string, number[]>()

  for (const [index, { x, y }] of positions.entries()) {
    const column = Math.floor(x / REPULSION_RADIUS)
    const row = Math.floor(y / REPULSION_RADIUS)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const other of buckets.get(`${column + dx}:${row + dy}`) ?? []) {
          const vx = x - positions[other].x
          const vy = y - positions[other].y
          const distance = Math.hypot(vx, vy)
          if (distance === 0 || distance >= REPULSION_RADIUS) continue
          const homeDistance = Math.hypot(
            nodes[index].home.x - nodes[other].home.x,
            nodes[index].home.y - nodes[other].home.y,
          )
          const compression = Math.min(homeDistance, REPULSION_RADIUS) - distance
          if (compression <= 0) continue
          const push = (compression * REPULSION_STRENGTH) / distance
          forces[index].x += vx * push
          forces[index].y += vy * push
          forces[other].x -= vx * push
          forces[other].y -= vy * push
        }
      }
    }
    const key = `${column}:${row}`
    const cell = buckets.get(key)
    if (cell) cell.push(index)
    else buckets.set(key, [index])
  }
}
