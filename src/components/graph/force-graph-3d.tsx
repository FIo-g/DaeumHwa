'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import { usePrefersReducedMotion } from '@/components/motion'
import { readMotionDuration } from '@/components/wiki/wiki-motion'
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import type { GraphEdge, GraphNode } from './graph-model'
import {
  linkCurvatures,
  nodeLabel,
  relationLabel,
  type ForceGraphRendererProps,
} from './force-graph-renderer'
import { ENTRY_KIND_MARK, GRAPH_FONT, type GraphPalette, drawKindMark } from './graph-style'

const SPRITE_HEIGHT = 46
const DOT_CENTER_X = 18
const LABEL_LEFT = 34
const MAX_TEXT_WIDTH = 380
const LABEL_FONT = `500 26px ${GRAPH_FONT}`

function makeNodeSprite(node: GraphNode, palette: GraphPalette, selected: boolean): Sprite {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context)
    return new Sprite(new SpriteMaterial({ color: palette[ENTRY_KIND_MARK[node.kind].ink] }))
  const background = selected ? palette.selection : palette.paper

  context.font = LABEL_FONT
  const textWidth = Math.min(MAX_TEXT_WIDTH, Math.ceil(context.measureText(node.name).width))
  canvas.width = LABEL_LEFT + textWidth + 10
  canvas.height = SPRITE_HEIGHT

  // A label slip of paper (nearly square corners), then the kind's mark.
  context.fillStyle = background
  const inset = selected ? 2 : 1
  context.beginPath()
  context.roundRect(inset, inset, canvas.width - 2 * inset, SPRITE_HEIGHT - 2 * inset, 3)
  context.fill()
  if (selected) {
    context.lineWidth = 3
    context.strokeStyle = palette.ink
    context.stroke()
  }
  drawKindMark(context, node.kind, DOT_CENTER_X, SPRITE_HEIGHT / 2, 9, palette, 3, background)

  context.font = LABEL_FONT
  context.textBaseline = 'middle'
  context.fillStyle = palette.ink
  context.fillText(node.name, LABEL_LEFT, SPRITE_HEIGHT / 2, MAX_TEXT_WIDTH)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  const sprite = new Sprite(material)
  sprite.scale.set((canvas.width / SPRITE_HEIGHT) * 12, 12, 1)
  sprite.center.set(DOT_CENTER_X / canvas.width, 0.5)
  return sprite
}

export default function Graph3D({
  data,
  width,
  height,
  palette,
  selectedEdgeId,
  selectedNodeId,
  onNodeSelect,
  onLinkSelect,
  onBackgroundSelect,
}: ForceGraphRendererProps) {
  const reduced = usePrefersReducedMotion()
  const surface = useRef<HTMLDivElement>(null)
  const renderer = useRef<ForceGraphMethods<GraphNode, GraphEdge>>(undefined)
  const flowingEdge = useRef<string | undefined>(undefined)
  const particleCount = useCallback(
    (link: GraphEdge) => (link.id === flowingEdge.current ? 2 : 0),
    [],
  )

  useEffect(() => {
    const graph = renderer.current
    flowingEdge.current = reduced ? undefined : selectedEdgeId
    graph?.refresh()
    if (!flowingEdge.current) return

    const timing = surface.current ? readMotionDuration(surface.current, '--b-cycle', 2400) : 2400
    const timer = window.setTimeout(() => {
      flowingEdge.current = undefined
      graph?.refresh()
    }, 2 * timing)
    return () => window.clearTimeout(timer)
  }, [selectedEdgeId, reduced])

  const hasFramedGraph = useRef(false)
  const frameGraph = useCallback(() => {
    if (hasFramedGraph.current || !renderer.current) return
    hasFramedGraph.current = true
    renderer.current.zoomToFit(0, Math.min(width, height) * 0.18)
  }, [width, height])
  const curvatures = useMemo(() => linkCurvatures(data.links), [data])
  // Three-forcegraph disposes each custom object's texture and material when it removes the node.
  const nodeObject = useCallback(
    (node: GraphNode) => makeNodeSprite(node, palette, node.id === selectedNodeId),
    [palette, selectedNodeId],
  )

  return (
    <div ref={surface}>
      <ForceGraph3D<GraphNode, GraphEdge>
        ref={renderer}
        graphData={data}
        width={width}
        height={height}
        backgroundColor={palette.paper}
        showNavInfo={false}
        nodeLabel={nodeLabel}
        nodeThreeObject={nodeObject}
        linkColor={palette.ink}
        linkWidth={(link) => (link.id === selectedEdgeId ? 0.7 : 0)}
        linkDirectionalParticles={particleCount}
        linkDirectionalParticleColor={palette.ink}
        linkDirectionalParticleWidth={1.2}
        linkHoverPrecision={2}
        linkOpacity={0.85}
        linkCurvature={(link) => curvatures.get(link.id) ?? 0}
        linkLabel={relationLabel}
        linkDirectionalArrowLength={(link) => (link.directed ? 4 : 0)}
        linkDirectionalArrowColor={palette.ink}
        linkDirectionalArrowRelPos={0.8}
        warmupTicks={24}
        cooldownTicks={90}
        cooldownTime={1800}
        onEngineStop={frameGraph}
        onNodeClick={(node) => onNodeSelect(node.id)}
        onLinkClick={(link) => onLinkSelect(link.id)}
        onBackgroundClick={onBackgroundSelect}
      />
    </div>
  )
}
