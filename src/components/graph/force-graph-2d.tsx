'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d'
import { circleOrder, type GraphEdge, type GraphNode } from './graph-model'
import {
  isLinkedTo,
  linkCurvatures,
  nodeLabel,
  relationLabel,
  type ForceGraphRendererProps,
} from './force-graph-renderer'
import { drawKindMark } from './graph-style'

export default function Graph2D({
  data,
  width,
  height,
  palette,
  font,
  focusedNodeId,
  selectedEdgeId,
  selectedNodeId,
  onNodeSelect,
  onLinkSelect,
  onBackgroundSelect,
}: ForceGraphRendererProps) {
  const { graphData, curvatures } = useMemo(() => {
    const order = circleOrder(data.nodes, data.links)
    const ranks = new Map(order.map((id, index) => [id, index]))
    const radius = order.length > 1 ? Math.max(110, order.length * 24) : 0
    return {
      graphData: {
        nodes: data.nodes.map((node) => {
          const angle = (((ranks.get(node.id) ?? 0) / order.length) * 2 - 0.5) * Math.PI
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          return { ...node, x, y, fx: x, fy: y }
        }),
        links: data.links,
      },
      curvatures: linkCurvatures(data.links),
    }
  }, [data])
  const [hoveredNodeId, setHoveredNodeId] = useState<string>()
  const highlightedNodeId = hoveredNodeId ?? focusedNodeId
  const renderer = useRef<ForceGraphMethods<GraphNode, GraphEdge>>(undefined)
  const hasFramedGraph = useRef(false)
  const frameGraph = useCallback(() => {
    if (hasFramedGraph.current || !renderer.current) return
    hasFramedGraph.current = true
    const padding = Math.min(width * 0.2, 88)
    renderer.current.zoomToFit(0, padding)
  }, [width])

  function nodeBounds(
    node: NodeObject<GraphNode>,
    context: CanvasRenderingContext2D,
    scale: number,
  ) {
    const unit = 1 / scale
    context.font = `700 ${(width < 400 ? 11 : 13) * unit}px ${font}`
    const nameWidth = context.measureText(node.name).width / unit + 28
    const boxWidth = Math.max(48, Math.min(width * 0.36, 176, nameWidth)) * unit
    const height = 30 * unit
    return {
      x: (node.x ?? 0) - boxWidth / 2,
      y: (node.y ?? 0) - height / 2,
      width: boxWidth,
      height,
      unit,
    }
  }

  return (
    <ForceGraph2D<GraphNode, GraphEdge>
      ref={renderer}
      graphData={graphData}
      width={width}
      height={height}
      nodeRelSize={5}
      nodeLabel={nodeLabel}
      nodeColor={() => palette.ink}
      nodeCanvasObjectMode={() => 'replace'}
      nodeCanvasObject={(node, context, scale) => {
        if (node.x === undefined || node.y === undefined) return
        const { x, y, width, height, unit } = nodeBounds(node, context, scale)
        const selected = node.id === selectedNodeId
        const background = selected ? palette.ink : palette.paper
        const ink = selected ? palette.paper : palette.ink
        context.fillStyle = background
        context.fillRect(x, y, width, height)
        context.strokeStyle = palette.ink
        context.lineWidth = (selected || node.id === highlightedNodeId ? 2 : 1.5) * unit
        context.strokeRect(x, y, width, height)
        drawKindMark(context, node.kind, x + 11 * unit, node.y, 4 * unit, ink, background, unit)

        context.fillStyle = ink
        context.textAlign = 'left'
        context.textBaseline = 'middle'
        context.fillText(node.name, x + 20 * unit, node.y, width - 28 * unit)
      }}
      nodePointerAreaPaint={(node, color, context, scale) => {
        const { x, y, width, height } = nodeBounds(node, context, scale)
        context.fillStyle = color
        context.fillRect(x, y, width, height)
      }}
      linkColor={() => palette.ink}
      linkWidth={(link) =>
        link.id === selectedEdgeId ||
        isLinkedTo(link, selectedNodeId) ||
        isLinkedTo(link, highlightedNodeId)
          ? 2
          : 1
      }
      linkHoverPrecision={7}
      linkCurvature={(link) => curvatures.get(link.id) ?? 0}
      linkLabel={relationLabel}
      linkCanvasObjectMode={() => 'after'}
      linkCanvasObject={(link, context, scale) => {
        const source = link.source as string | NodeObject<GraphNode>
        const target = link.target as string | NodeObject<GraphNode>
        if (typeof source !== 'object' || typeof target !== 'object') return
        if (source.x == null || source.y == null || target.x == null || target.y == null) return

        const curvature = curvatures.get(link.id) ?? 0
        const x = (source.x + target.x + (target.y - source.y) * curvature) / 2
        const y = (source.y + target.y - (target.x - source.x) * curvature) / 2
        const unit = 1 / scale
        context.font = `500 ${11 * unit}px ${font}`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        const labelWidth = Math.min(92 * unit, context.measureText(link.kind).width)
        context.fillStyle = palette.paper
        context.fillRect(
          x - labelWidth / 2 - 3 * unit,
          y - 7 * unit,
          labelWidth + 6 * unit,
          14 * unit,
        )
        context.fillStyle = palette.ink
        context.fillText(link.kind, x, y, 92 * unit)
      }}
      linkDirectionalArrowLength={(link) => (link.directed ? 4 : 0)}
      linkDirectionalArrowColor={() => palette.ink}
      linkDirectionalArrowRelPos={0.65}
      cooldownTicks={0}
      onEngineStop={frameGraph}
      onNodeHover={(node) => setHoveredNodeId(node?.id)}
      onNodeClick={(node) => onNodeSelect(node.id)}
      onLinkClick={(link) => onLinkSelect(link.id)}
      onBackgroundClick={onBackgroundSelect}
    />
  )
}
