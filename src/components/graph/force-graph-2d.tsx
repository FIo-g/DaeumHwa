'use client'

import { useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { ENTRY_KIND_COLOR, type GraphEdge, type GraphNode } from './graph-model'
import {
  linkCurvatures,
  nodeLabel,
  relationColor,
  relationLabel,
  type ForceGraphRendererProps,
} from './force-graph-renderer'

const NODE_RADIUS = 4

export default function Graph2D({
  data,
  width,
  height,
  palette,
  onNodeSelect,
  onLinkSelect,
  onBackgroundSelect,
}: ForceGraphRendererProps) {
  const curvatures = useMemo(() => linkCurvatures(data.links), [data])

  return (
    <ForceGraph2D<GraphNode, GraphEdge>
      graphData={data}
      width={width}
      height={height}
      backgroundColor={palette.background}
      nodeRelSize={NODE_RADIUS}
      nodeLabel={nodeLabel}
      nodeColor={(node) => ENTRY_KIND_COLOR[node.kind]}
      nodeCanvasObjectMode={() => 'after'}
      nodeCanvasObject={(node, context, scale) => {
        if (node.x === undefined || node.y === undefined) return
        const fontSize = Math.min(9, 13 / scale)
        if (fontSize * scale < 8) return

        const labelY = node.y + NODE_RADIUS + 2
        context.font = `600 ${fontSize}px sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'top'
        const labelWidth = context.measureText(node.name).width
        context.fillStyle = palette.background
        context.fillRect(node.x - labelWidth / 2 - 2, labelY - 1, labelWidth + 4, fontSize + 2)
        context.fillStyle = palette.foreground
        context.fillText(node.name, node.x, labelY)
      }}
      linkColor={relationColor}
      linkWidth={1.25}
      linkHoverPrecision={7}
      linkCurvature={(link) => curvatures.get(link.id) ?? 0}
      linkLabel={relationLabel}
      linkDirectionalArrowLength={(link) => (link.directed ? 5 : 0)}
      linkDirectionalArrowColor={relationColor}
      linkDirectionalArrowRelPos={0.85}
      warmupTicks={24}
      cooldownTicks={90}
      cooldownTime={1800}
      onNodeClick={(node) => onNodeSelect(node.id)}
      onLinkClick={(link) => onLinkSelect(link.id)}
      onBackgroundClick={onBackgroundSelect}
    />
  )
}
