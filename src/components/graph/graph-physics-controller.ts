import type { Core } from 'cytoscape'
import {
  clampNode,
  HOVER_DURATION,
  hoverScale,
  ORIGIN,
  PHYSICS_STEP,
  SETTLE_LIMIT,
  settled,
  stepPhysics,
  type PhysicsNode,
  type Point,
} from './graph-physics'

type VisibleGraph = { nodeIds: Set<string>; edgeIds: Set<string> }
type Camera = { zoom: number; pan: Point }
type Drag = { id: string; point: Point; time: number; velocity: Point; moved: boolean }

const CURSOR_LIFETIME = 0.13
const NEIGHBOR_IMPULSE = 125
const RELEASE_SPEED = 260

export function createGraphPhysics(
  graph: Core,
  container: HTMLElement,
  initialVisible: VisibleGraph,
  enter: boolean,
) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const bodies = new Map(
    graph.nodes().map((node) => [
      node.id(),
      {
        node,
        home: { ...node.position() },
        halfSize: { x: Number(node.data('width')) / 2, y: Number(node.data('height')) / 2 },
      },
    ]),
  )
  let visible = initialVisible
  let springs = visibleSprings()
  let previews = ''
  let scaleNode: string | undefined
  let lastScale = 1
  let pulse: { id: string; at: number } | undefined
  let drag: Drag | undefined
  let pointer: { point: Point; at: number } | undefined
  let camera: { from: Camera; to: Camera; minimum: number; at: number } | undefined
  let writingCamera = false
  let onscreen = intersectsViewport()
  let frameId: number | undefined
  let deadline = 0
  let previousTime = 0
  let accumulator = 0
  let state = new Map<string, PhysicsNode>()

  function bounds() {
    return { width: graph.width(), height: graph.height() }
  }

  function viewport(): Camera {
    return { zoom: graph.zoom(), pan: { ...graph.pan() } }
  }

  function toScreen(point: Point, view: Camera): Point {
    return { x: point.x * view.zoom + view.pan.x, y: point.y * view.zoom + view.pan.y }
  }

  function visibleSprings() {
    const active = []
    for (const edge of graph.edges()) {
      if (visible.edgeIds.has(edge.id())) {
        active.push({ source: edge.source().id(), target: edge.target().id() })
      }
    }
    return active
  }

  function canMove() {
    return onscreen && !document.hidden && !motion.matches
  }

  function intersectsViewport() {
    const rect = container.getBoundingClientRect()
    return (
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight
    )
  }

  function stateFor(id: string, view: Camera, value = state.get(id)): PhysicsNode {
    const body = bodies.get(id)!
    return {
      id,
      home: toScreen(body.home, view),
      halfSize: {
        x: (body.halfSize.x + 1) * view.zoom,
        y: (body.halfSize.y + 1) * view.zoom,
      },
      offset: value?.offset ?? ORIGIN,
      velocity: value?.velocity ?? ORIGIN,
    }
  }

  function start() {
    if (!canMove()) return
    const time = performance.now()
    deadline = time + SETTLE_LIMIT * 1000
    if (frameId !== undefined) return
    previousTime = time
    accumulator = 0
    frameId = requestAnimationFrame(tick)
  }

  function writeCamera(view: Camera) {
    writingCamera = true
    graph.viewport(view)
    writingCamera = false
  }

  function finishCamera() {
    if (!camera) return
    writeCamera(camera.to)
    graph.minZoom(camera.minimum)
    camera = undefined
  }

  function setScale(id: string | undefined, scale: number) {
    if (id === scaleNode && Math.abs(scale - lastScale) < 0.0005) return
    if (scaleNode && (id !== scaleNode || scale === 1)) {
      bodies.get(scaleNode)?.node.removeStyle('width height font-size')
    }
    scaleNode = scale === 1 ? undefined : id
    lastScale = scale
    if (!scaleNode) return
    const body = bodies.get(scaleNode)!
    body.node.style({
      width: body.halfSize.x * 2 * scale,
      height: body.halfSize.y * 2 * scale,
      'font-size': 13 * scale,
    })
  }

  function paint(view: Camera) {
    for (const [id, value] of state) {
      if (id === drag?.id) continue
      const body = bodies.get(id)!
      const x = body.home.x + value.offset.x / view.zoom
      const y = body.home.y + value.offset.y / view.zoom
      const current = body.node.position()
      if (Math.abs(current.x - x) > 0.001 || Math.abs(current.y - y) > 0.001) {
        body.node.position({ x, y })
      }
    }
  }

  function settle() {
    if (frameId !== undefined) cancelAnimationFrame(frameId)
    frameId = undefined
    pulse = undefined
    pointer = undefined
    graph.batch(() => {
      finishCamera()
      setScale(undefined, 1)
      for (const id of state.keys()) {
        if (id !== drag?.id) {
          const body = bodies.get(id)!
          body.node.position(body.home)
        }
      }
    })
    state.clear()
  }

  function tick(time: number) {
    frameId = undefined
    if (!canMove() || (!drag && time >= deadline)) {
      settle()
      return
    }

    graph.batch(() => {
      if (camera) {
        const age = Math.max(0, (time - camera.at) / 1000)
        const progress = 1 - Math.exp(-9 * age) * (Math.cos(8 * age) + (9 / 8) * Math.sin(8 * age))
        if (progress >= 0.999 || age >= SETTLE_LIMIT) finishCamera()
        else {
          const { from, to } = camera
          writeCamera({
            zoom: from.zoom + (to.zoom - from.zoom) * progress,
            pan: {
              x: from.pan.x + (to.pan.x - from.pan.x) * progress,
              y: from.pan.y + (to.pan.y - from.pan.y) * progress,
            },
          })
        }
      }

      const view = viewport()
      const area = bounds()
      const cursor =
        pointer && !drag && time - pointer.at < CURSOR_LIFETIME * 1000 ? pointer.point : undefined
      const heldHome = drag && toScreen(bodies.get(drag.id)!.home, view)
      const grabbed = drag &&
        heldHome && {
          id: drag.id,
          offset: { x: drag.point.x - heldHome.x, y: drag.point.y - heldHome.y },
        }
      let current = [...visible.nodeIds].map((id) => stateFor(id, view))
      accumulator += Math.max(0, Math.min((time - previousTime) / 1000, 0.05))
      previousTime = time
      const stepped = accumulator >= PHYSICS_STEP
      while (accumulator >= PHYSICS_STEP) {
        current = stepPhysics(current, { springs, bounds: area, grabbed, cursor })
        accumulator -= PHYSICS_STEP
      }
      const steadyDrag =
        drag &&
        stepped &&
        current.every((body) => {
          if (body.id === drag?.id) return true
          const before = state.get(body.id)?.offset
          return (
            before &&
            Math.hypot(body.velocity.x, body.velocity.y) < 0.75 &&
            Math.hypot(body.offset.x - before.x, body.offset.y - before.y) < 0.025
          )
        })
      state = new Map(current.map((body) => [body.id, body]))
      paint(view)

      const age = pulse ? (time - pulse.at) / 1000 : HOVER_DURATION
      if (age >= HOVER_DURATION) pulse = undefined
      setScale(pulse?.id, pulse ? hoverScale(age) : 1)

      if (!drag && !cursor && !pulse && !camera && current.every(settled)) settle()
      else if (!steadyDrag) frameId = requestAnimationFrame(tick)
    })
  }

  function kickTowards(id: string, toward: string, speed: number) {
    const view = viewport()
    const body = stateFor(id, view)
    const center = toScreen(bodies.get(toward)!.home, view)
    const x = center.x - body.home.x
    const y = center.y - body.home.y
    const distance = Math.hypot(x, y)
    if (distance === 0) return
    body.velocity = { x: (x / distance) * speed, y: (y / distance) * speed }
    state.set(id, body)
  }

  function fanOut(ids: Iterable<string>, fraction: number, limit: number) {
    const view = viewport()
    const center = { x: 0, y: 0 }
    for (const id of visible.nodeIds) {
      const home = toScreen(bodies.get(id)!.home, view)
      center.x += home.x / visible.nodeIds.size
      center.y += home.y / visible.nodeIds.size
    }
    for (const id of ids) {
      const body = stateFor(id, view)
      const x = center.x - body.home.x
      const y = center.y - body.home.y
      const amount = Math.min(fraction, limit / (Math.hypot(x, y) || 1))
      state.set(id, { ...body, offset: { x: x * amount, y: y * amount } })
    }
    graph.batch(() => paint(view))
  }

  function paintPreview() {
    graph.batch(() => {
      graph.elements('.highlighted, .preview-dimmed').removeClass('highlighted preview-dimmed')
      if (!previews) return
      const node = graph.getElementById(previews)
      const edges = node.connectedEdges().filter((edge) => visible.edgeIds.has(edge.id()))
      const neighbors = edges.connectedNodes().union(node)
      node.union(edges).addClass('highlighted')
      graph.elements().difference(neighbors.union(edges)).addClass('preview-dimmed')
    })
  }

  function updatePreview(id: string | null) {
    const next = id && visible.nodeIds.has(id) ? id : ''
    if (previews === next) return
    previews = next
    paintPreview()
    pulse = undefined
    setScale(undefined, 1)
    if (!next || drag || !canMove()) return
    pulse = { id: next, at: performance.now() }
    for (const spring of springs) {
      if (spring.source === next) kickTowards(spring.target, next, NEIGHBOR_IMPULSE)
      else if (spring.target === next) kickTowards(spring.source, next, NEIGHBOR_IMPULSE)
    }
    start()
  }

  function updateVisibility(next: VisibleGraph) {
    if (visible === next) return
    const previous = visible
    visible = next
    springs = visibleSprings()
    if (!next.nodeIds.has(previews)) updatePreview(null)
    else paintPreview()
    for (const id of state.keys()) {
      if (next.nodeIds.has(id)) continue
      const body = bodies.get(id)!
      body.node.position(body.home)
      state.delete(id)
    }
    if (drag && !next.nodeIds.has(drag.id)) drag = undefined
    if (!canMove()) return

    const introduced = [...next.nodeIds].filter((id) => !previous.nodeIds.has(id))
    for (const edge of graph.edges()) {
      if (previous.edgeIds.has(edge.id()) === next.edgeIds.has(edge.id())) continue
      const source = edge.source().id()
      const target = edge.target().id()
      if (next.nodeIds.has(source) && next.nodeIds.has(target)) {
        kickTowards(source, target, NEIGHBOR_IMPULSE * 0.6)
        kickTowards(target, source, NEIGHBOR_IMPULSE * 0.6)
      }
    }
    fanOut(introduced, 0.33, 65)
    if (state.size) start()
  }

  function arrange(change: () => void) {
    const from = viewport()
    const starts = new Map(
      [...visible.nodeIds].map((id) => [id, { ...bodies.get(id)!.node.renderedPosition() }]),
    )
    const animate = canMove()
    graph.batch(() => {
      settle()
      change()
      for (const body of bodies.values()) body.home = { ...body.node.position() }
      if (!animate || starts.size === 0) return
      const to = viewport()
      camera = { from, to, minimum: graph.minZoom(), at: performance.now() }
      graph.minZoom(Math.min(from.zoom, camera.minimum))
      writeCamera(from)
      for (const [id, position] of starts) {
        const body = stateFor(id, from)
        state.set(id, {
          ...body,
          offset: { x: position.x - body.home.x, y: position.y - body.home.y },
        })
      }
      paint(from)
    })
    if (animate && starts.size) start()
  }

  graph.on('grabon', 'node', (event) => {
    const id: string = event.target.id()
    if (!visible.nodeIds.has(id)) return
    const point = { ...event.target.renderedPosition() }
    drag = { id, point, time: performance.now(), velocity: ORIGIN, moved: false }
    pointer = undefined
    pulse = undefined
    setScale(undefined, 1)
    if (camera) {
      graph.minZoom(Math.min(graph.zoom(), camera.minimum))
      camera = undefined
    }
    if (canMove()) start()
  })

  graph.on('drag', 'node', (event) => {
    if (!drag || drag.id !== event.target.id()) return
    const current = performance.now()
    const body = stateFor(drag.id, viewport())
    const point = clampNode(event.target.renderedPosition(), body.halfSize, bounds())
    const elapsed = Math.max((current - drag.time) / 1000, PHYSICS_STEP)
    const vx = (point.x - drag.point.x) / elapsed
    const vy = (point.y - drag.point.y) / elapsed
    const speed = Math.max(1, Math.hypot(vx, vy) / RELEASE_SPEED)
    drag = {
      id: drag.id,
      point,
      time: current,
      velocity: { x: vx / speed, y: vy / speed },
      moved: true,
    }
    event.target.renderedPosition(point)
    if (canMove()) start()
  })

  graph.on('freeon', 'node', (event) => {
    if (!drag || drag.id !== event.target.id()) return
    const { id, point, time, velocity, moved } = drag
    drag = undefined
    if (moved) {
      const body = bodies.get(id)!
      const view = viewport()
      const home = toScreen(body.home, view)
      body.home = { ...body.node.position() }
      const distance = Math.hypot(point.x - home.x, point.y - home.y) || 1
      const fallbackSpeed = Math.min(115, distance * 4)
      state.set(id, {
        ...stateFor(id, view),
        offset: ORIGIN,
        velocity:
          performance.now() - time < 110
            ? velocity
            : {
                x: ((point.x - home.x) / distance) * fallbackSpeed,
                y: ((point.y - home.y) / distance) * fallbackSpeed,
              },
      })
    }
    if (canMove() && moved) start()
    else settle()
  })

  graph.on('viewport', () => {
    if (writingCamera) return
    if (camera) {
      graph.minZoom(Math.min(graph.zoom(), camera.minimum))
      camera = undefined
    }
    pointer = undefined
  })

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || event.buttons || !canMove()) return
    const rect = container.getBoundingClientRect()
    const scale = container.currentCSSZoom || 1
    pointer = {
      point: {
        x: (event.clientX - rect.left) / scale - container.clientLeft,
        y: (event.clientY - rect.top) / scale - container.clientTop,
      },
      at: performance.now(),
    }
    start()
  }

  function onPointerLeave() {
    pointer = undefined
  }

  function syncMotion() {
    graph.edges().toggleClass('animated', !motion.matches)
    if (!canMove()) settle()
  }

  const observer = new IntersectionObserver(([entry]) => {
    onscreen = entry.isIntersecting
    if (!onscreen) settle()
  })
  observer.observe(container)
  container.addEventListener('pointermove', onPointerMove)
  container.addEventListener('pointerleave', onPointerLeave)
  document.addEventListener('visibilitychange', syncMotion)
  motion.addEventListener('change', syncMotion)
  syncMotion()
  if (enter && canMove()) {
    fanOut(visible.nodeIds, 0.68, 145)
    start()
  }

  return {
    updatePreview,
    updateVisibility,
    arrange,
    dispose() {
      settle()
      observer.disconnect()
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', syncMotion)
      motion.removeEventListener('change', syncMotion)
    },
  }
}
