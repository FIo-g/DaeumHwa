'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import { CanvasTexture, MeshBasicMaterial, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import { usePrefersReducedMotion } from '@/components/motion'
import type { GraphEdge, GraphNode } from './graph-model'
import {
  isLinkedTo,
  linkCurvatures,
  nodeLabel,
  relationLabel,
  type ForceGraphRendererProps,
} from './force-graph-renderer'
import { type GraphPalette, drawKindMark } from './graph-style'

const SPRITE_HEIGHT = 46
const DOT_CENTER_X = 18
const LABEL_LEFT = 34
const MAX_TEXT_WIDTH = 380

function makeNodeSprite(
  node: GraphNode,
  palette: GraphPalette,
  font: string,
  selected: boolean,
  highlighted: boolean,
): Sprite {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return new Sprite(new SpriteMaterial({ color: palette.ink }))
  const background = selected ? palette.ink : palette.paper
  const ink = selected ? palette.paper : palette.ink
  const labelFont = `700 26px ${font}`

  context.font = labelFont
  const textWidth = Math.min(MAX_TEXT_WIDTH, Math.ceil(context.measureText(node.name).width))
  canvas.width = LABEL_LEFT + textWidth + 10
  canvas.height = SPRITE_HEIGHT

  const thickness = selected || highlighted ? 4 : 3
  const inset = thickness / 2
  context.fillStyle = background
  context.fillRect(0, 0, canvas.width, SPRITE_HEIGHT)
  context.lineWidth = thickness
  context.strokeStyle = palette.ink
  context.strokeRect(inset, inset, canvas.width - thickness, SPRITE_HEIGHT - thickness)
  drawKindMark(context, node.kind, DOT_CENTER_X, SPRITE_HEIGHT / 2, 8, ink, background, 2.5)

  context.font = labelFont
  context.textBaseline = 'middle'
  context.fillStyle = ink
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
  font,
  focusedNodeId,
  selectedEdgeId,
  selectedNodeId,
  onNodeSelect,
  onLinkSelect,
  onBackgroundSelect,
}: ForceGraphRendererProps) {
  const reducedMotion = usePrefersReducedMotion()
  const renderer = useRef<ForceGraphMethods<GraphNode, GraphEdge>>(undefined)
  const [hoveredNodeId, setHoveredNodeId] = useState<string>()
  const highlightedNodeId = hoveredNodeId ?? focusedNodeId

  const hasFramedGraph = useRef(false)
  const frameGraph = useCallback(() => {
    const graph = renderer.current
    if (hasFramedGraph.current || !graph) return
    hasFramedGraph.current = true
    const camera = graph.camera()
    const distance = camera.position.length()
    graph.cameraPosition({ x: -distance * 0.7, y: distance * 0.6, z: distance * 0.45 })
    camera.lookAt(0, 0, 0)
    graph.zoomToFit(0, Math.min(width, height) * 0.18)
  }, [width, height])
  const curvatures = useMemo(() => linkCurvatures(data.links), [data])
  const linkMaterial = useCallback(
    () => new MeshBasicMaterial({ color: palette.ink, toneMapped: false }),
    [palette.ink],
  )
  // Three-forcegraph disposes each custom object's texture and material when it removes the node.
  const nodeObject = useCallback(
    (node: GraphNode) =>
      makeNodeSprite(
        node,
        palette,
        font,
        node.id === selectedNodeId,
        node.id === highlightedNodeId,
      ),
    [palette, font, highlightedNodeId, selectedNodeId],
  )

  return (
    <ForceGraph3D<GraphNode, GraphEdge>
      ref={renderer}
      graphData={data}
      width={width}
      height={height}
      backgroundColor={palette.paper}
      showNavInfo={false}
      nodeLabel={nodeLabel}
      nodeThreeObject={nodeObject}
      linkColor={() => palette.ink}
      linkMaterial={linkMaterial}
      linkWidth={(link) =>
        link.id === selectedEdgeId ||
        isLinkedTo(link, selectedNodeId) ||
        isLinkedTo(link, highlightedNodeId)
          ? 1.15
          : 0.55
      }
      linkHoverPrecision={2}
      linkOpacity={1}
      linkCurvature={(link) => curvatures.get(link.id) ?? 0}
      linkLabel={relationLabel}
      linkDirectionalArrowLength={(link) => (link.directed ? 4 : 0)}
      linkDirectionalArrowColor={() => palette.ink}
      linkDirectionalArrowRelPos={0.8}
      warmupTicks={reducedMotion ? 114 : 24}
      cooldownTicks={reducedMotion ? 0 : 90}
      cooldownTime={1800}
      onEngineStop={frameGraph}
      onNodeHover={(node) => setHoveredNodeId(node?.id)}
      onNodeClick={(node) => onNodeSelect(node.id)}
      onLinkClick={(link) => onLinkSelect(link.id)}
      onBackgroundClick={onBackgroundSelect}
    />
  )
}
