import type { GraphEdge, GraphNode } from './graph-model'
import type { GraphPalette } from './graph-style'

export type ForceGraphRendererProps = {
  data: { nodes: GraphNode[]; links: GraphEdge[] }
  width: number
  height: number
  palette: GraphPalette
  font: string
  focusedNodeId?: string
  selectedEdgeId?: string
  selectedNodeId?: string
  onNodeSelect: (id: string) => void
  onLinkSelect: (id: string) => void
  onBackgroundSelect: () => void
}

function tooltipText(text: string): string {
  // The underlying tooltip treats strings as HTML.
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function nodeLabel(node: GraphNode): string {
  return tooltipText(node.name)
}

export function relationLabel(link: GraphEdge): string {
  return tooltipText(link.kind)
}

export function linkCurvatures(links: GraphEdge[]): Map<string, number> {
  const pairs = new Map<string, GraphEdge[]>()
  for (const link of links) {
    const pair = [link.source, link.target].sort().join(':')
    const samePair = pairs.get(pair)
    if (samePair) samePair.push(link)
    else pairs.set(pair, [link])
  }

  const curvatures = new Map<string, number>()
  for (const samePair of pairs.values()) {
    const middle = (samePair.length - 1) / 2
    const spacing = Math.min(0.25, 1.5 / samePair.length)
    for (const [index, link] of samePair.entries()) {
      const direction = link.source < link.target ? 1 : -1
      curvatures.set(link.id, direction * (index - middle) * spacing)
    }
  }
  return curvatures
}

export function isLinkedTo(link: GraphEdge, nodeId?: string): boolean {
  if (!nodeId) return false
  // The force engine replaces each endpoint ID with its node object.
  const endpoints: (string | GraphNode)[] = [link.source, link.target]
  return endpoints.some(
    (endpoint) => (typeof endpoint === 'string' ? endpoint : endpoint.id) === nodeId,
  )
}
