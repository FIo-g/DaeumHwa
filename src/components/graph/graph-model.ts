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

export const ENTRY_KIND_COLOR: Record<EntryKind, string> = {
  character: '#2563eb',
  place: '#16a34a',
  organization: '#9333ea',
  item: '#ea580c',
  rule: '#0891b2',
  event: '#dc2626',
  term: '#ca8a04',
  other: '#6b7280',
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

/** Human-readable range such as "3화부터 8화까지". Null ends mean open. */
export function formatRelationRange(start: number | null, end: number | null): string {
  if (start === null && end === null) return '전 기간'
  if (end === null) return `${start}화부터`
  if (start === null) return `${end}화까지`
  return `${start}화부터 ${end}화까지`
}
