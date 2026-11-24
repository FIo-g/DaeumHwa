'use client'

import { useCallback, useMemo, useRef } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import type { GraphEdge, GraphNode } from './graph-model'
import {
  linkCurvatures,
  nodeLabel,
  relationColor,
  relationLabel,
  type ForceGraphRendererProps,
} from './force-graph-renderer'
import { ENTRY_KIND_MARK, GRAPH_FONT, drawKindMark } from './graph-style'

const SPRITE_HEIGHT = 46
const DOT_CENTER_X = 18
const LABEL_LEFT = 34
const MAX_TEXT_WIDTH = 380
const LABEL_FONT = `500 26px ${GRAPH_FONT}`

function makeNodeSprite(node: GraphNode, foreground: string, background: string): Sprite {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return new Sprite(new SpriteMaterial({ color: ENTRY_KIND_MARK[node.kind].ink }))

  context.font = LABEL_FONT
  const textWidth = Math.min(MAX_TEXT_WIDTH, Math.ceil(context.measureText(node.name).width))
  canvas.width = LABEL_LEFT + textWidth + 10
  canvas.height = SPRITE_HEIGHT

  // A label slip of paper (nearly square corners), then the kind's mark.
  context.fillStyle = background
  context.beginPath()
  context.roundRect(1, 1, canvas.width - 2, SPRITE_HEIGHT - 2, 3)
  context.fill()
  drawKindMark(context, node.kind, DOT_CENTER_X, SPRITE_HEIGHT / 2, 9, background, 3)

  context.font = LABEL_FONT
  context.textBaseline = 'middle'
  context.fillStyle = foreground
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
  palette: { foreground, background },
  onNodeSelect,
  onLinkSelect,
  onBackgroundSelect,
}: ForceGraphRendererProps) {
  const renderer = useRef<ForceGraphMethods<GraphNode, GraphEdge>>(undefined)
  const hasFramedGraph = useRef(false)
  const frameGraph = useCallback(() => {
    if (hasFramedGraph.current || !renderer.current) return
    hasFramedGraph.current = true
    renderer.current.zoomToFit(0, Math.min(width, height) * 0.18)
  }, [width, height])
  const curvatures = useMemo(() => linkCurvatures(data.links), [data])
  // Three-forcegraph disposes each custom object's texture and material when it removes the node.
  const nodeObject = useCallback(
    (node: GraphNode) => makeNodeSprite(node, foreground, background),
    [foreground, background],
  )

  return (
    <ForceGraph3D<GraphNode, GraphEdge>
      ref={renderer}
      graphData={data}
      width={width}
      height={height}
      backgroundColor={background}
      showNavInfo={false}
      nodeLabel={nodeLabel}
      nodeThreeObject={nodeObject}
      linkColor={relationColor}
      linkWidth={0}
      linkHoverPrecision={2}
      linkOpacity={0.85}
      linkCurvature={(link) => curvatures.get(link.id) ?? 0}
      linkLabel={relationLabel}
      linkDirectionalArrowLength={(link) => (link.directed ? 4 : 0)}
      linkDirectionalArrowColor={relationColor}
      linkDirectionalArrowRelPos={0.8}
      warmupTicks={24}
      cooldownTicks={90}
      cooldownTime={1800}
      onEngineStop={frameGraph}
      onNodeClick={(node) => onNodeSelect(node.id)}
      onLinkClick={(link) => onLinkSelect(link.id)}
      onBackgroundClick={onBackgroundSelect}
    />
  )
}
