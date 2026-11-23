import { RELATION_KIND_SUGGESTIONS, type GraphEdge, type GraphNode } from './graph-model'

export type ForceGraphRendererProps = {
  data: { nodes: GraphNode[]; links: GraphEdge[] }
  width: number
  height: number
  palette: { foreground: string; background: string }
  onNodeSelect: (id: string) => void
  onLinkSelect: (id: string) => void
  onBackgroundSelect: () => void
}

const RELATION_COLORS = [
  '#3769a6',
  '#ad5880',
  '#b8543d',
  '#458653',
  '#8060ad',
  '#956920',
  '#378282',
]

export function relationKindColor(kind: string): string {
  const suggested = RELATION_KIND_SUGGESTIONS.findIndex((suggestion) => suggestion === kind)
  if (suggested >= 0) return RELATION_COLORS[suggested]

  // Free-text kinds still receive a stable color across chapters and renderers.
  let hash = 0
  for (const character of kind) hash = Math.imul(hash, 31) + character.charCodeAt(0)
  return `hsl(${(hash >>> 0) % 360}, 54%, 44%)`
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

export function relationColor(link: GraphEdge): string {
  return relationKindColor(link.kind)
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
