import type { EntryKind } from '@/db/types'

// Pure data rules for the relationship graph. Shared by the graph view and its tests.
// A `position` of null means 전체 보기 (no chapter filter).

export type GraphNode = {
  id: string
  name: string
  kind: EntryKind
  firstAppearance: number | null
}

export type GraphEdge = {
  id: string
  source: string
  target: string
  kind: string
  description: string
  directed: boolean
  startPosition: number | null
  endPosition: number | null
}

export const RELATION_KIND_SUGGESTIONS = [
  '가족',
  '연인',
  '적대',
  '동료',
  '소속',
  '스승',
  '친구',
] as const

/** The chapter slider starts at the latest chapter, and at 1 before any chapter exists. */
export function defaultPosition(latestPosition: number): number {
  return Math.max(1, latestPosition)
}

const DEFAULT_MIN_ZOOM = 0.3

export function fitMinZoom(fitZoom: number): number {
  if (!Number.isFinite(fitZoom) || fitZoom <= 0) return DEFAULT_MIN_ZOOM
  return Math.min(DEFAULT_MIN_ZOOM, fitZoom)
}

/** A card shows when its first appearance is at or before the position (no record: always). */
export function isNodeVisible(
  node: GraphNode,
  position: number | null,
  hiddenKinds: EntryKind[],
): boolean {
  if (hiddenKinds.includes(node.kind)) return false
  if (position === null) return true
  return node.firstAppearance === null || node.firstAppearance <= position
}

/** A relation shows when the position is inside its range (null start or end is open). */
export function isEdgeVisible(edge: GraphEdge, position: number | null): boolean {
  if (position === null) return true
  const started = edge.startPosition === null || edge.startPosition <= position
  const notEnded = edge.endPosition === null || position <= edge.endPosition
  return started && notEnded
}

/** Visible node and edge ids. An edge is visible only when both of its cards are visible. */
export function visibleGraph(
  data: { nodes: GraphNode[]; edges: GraphEdge[] },
  position: number | null,
  hiddenKinds: EntryKind[],
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set(
    data.nodes.filter((n) => isNodeVisible(n, position, hiddenKinds)).map((n) => n.id),
  )
  const edgeIds = new Set(
    data.edges
      .filter((e) => isEdgeVisible(e, position) && nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => e.id),
  )
  return { nodeIds, edgeIds }
}

/** The renderer writes coordinates and replaces link endpoints, so give it fresh objects. */
export function createForceGraphData(
  data: { nodes: GraphNode[]; edges: GraphEdge[] },
  position: number | null,
  hiddenKinds: EntryKind[],
): { nodes: GraphNode[]; links: GraphEdge[] } {
  const { nodeIds, edgeIds } = visibleGraph(data, position, hiddenKinds)
  return {
    nodes: data.nodes.filter((node) => nodeIds.has(node.id)).map((node) => ({ ...node })),
    links: data.edges.filter((edge) => edgeIds.has(edge.id)).map((edge) => ({ ...edge })),
  }
}

/**
 * Order of the cards around the circle layout: each group of linked cards walked depth first from
 * its least-linked card, bigger groups first, lone cards last. Linked cards sit side by side, so
 * most lines are short chords instead of crossing the circle.
 */
export function circleOrder(
  nodes: Pick<GraphNode, 'id' | 'name'>[],
  edges: Pick<GraphEdge, 'source' | 'target'>[],
): string[] {
  const ids = new Set(nodes.map((n) => n.id))
  const name = new Map(nodes.map((n) => [n.id, n.name]))
  const neighbours = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set()]))
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) continue
    neighbours.get(edge.source)?.add(edge.target)
    neighbours.get(edge.target)?.add(edge.source)
  }
  const degree = (id: string) => neighbours.get(id)?.size ?? 0
  const byDegreeThenName = (a: string, b: string) =>
    degree(a) - degree(b) || (name.get(a) ?? '').localeCompare(name.get(b) ?? '', 'ko')

  const seen = new Set<string>()
  const groups: string[][] = []
  for (const start of [...ids].sort(byDegreeThenName)) {
    if (seen.has(start)) continue
    const group: string[] = []
    const stack = [start]
    while (stack.length > 0) {
      const id = stack.pop() as string
      if (seen.has(id)) continue
      seen.add(id)
      group.push(id)
      // Push in reverse so the least-linked neighbour is walked first.
      const next = [...(neighbours.get(id) ?? [])].filter((n) => !seen.has(n))
      stack.push(...next.sort(byDegreeThenName).reverse())
    }
    groups.push(group)
  }
  return groups.sort((a, b) => b.length - a.length).flat()
}

/** Human-readable range such as "3화부터 8화까지". Null ends mean open. */
export function formatRelationRange(start: number | null, end: number | null): string {
  if (start === null && end === null) return '전 기간'
  if (end === null) return `${start}화부터`
  if (start === null) return `${end}화까지`
  return `${start}화부터 ${end}화까지`
}
