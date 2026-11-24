'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { Core, ElementDefinition, LayoutOptions, StylesheetStyle } from 'cytoscape'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { PopButton } from '@/components/motion'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ENTRY_KINDS, type EntryKind, type Role } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import { archiveRelationAction } from '@/server/actions/relations'
import {
  type GraphEdge,
  type GraphNode,
  defaultPosition,
  circleOrder,
  fitMinZoom,
  formatRelationRange,
  visibleGraph,
} from './graph-model'
import { GraphControls } from './graph-controls'
import { createGraphPhysics } from './graph-physics-controller'
import { type GraphPalette, readGraphFont, readGraphPalette, readGraphTiming } from './graph-style'
import { KindIcon } from './kind-icon'
import { RelationForm } from './relation-form'

type RelationGraphProps = {
  workId: string
  role: Role
  nodes: GraphNode[]
  edges: GraphEdge[]
  latestPosition: number
  /** Heading of the tab, shown left of the actions. */
  intro?: ReactNode
  /** Extra actions shown before 관계 추가. */
  actions?: ReactNode
}

type Selection = { type: 'node' | 'edge'; id: string } | null

/** Fitting a small graph would blow the marks up to poster size; stop at a reading scale. */
const MAX_FIT_ZOOM = 1.15

/**
 * A circle in linked order. cose collapsed linked cards into one spot (and fitting that spot made
 * the marks huge); the circle is stable between visits and keeps every label readable.
 */
function circleLayout(nodes: GraphNode[], edges: GraphEdge[]): LayoutOptions {
  const rank = new Map(circleOrder(nodes, edges).map((id, index) => [id, index]))
  return {
    name: 'circle',
    animate: false,
    fit: true,
    padding: 48,
    avoidOverlap: true,
    radius: Math.max(110, nodes.length * 24),
    sort: (a, b) => (rank.get(a.id()) ?? 0) - (rank.get(b.id()) ?? 0),
    stop: (event) => capFitZoom(event.cy),
  }
}

function capFitZoom(graph: Core) {
  if (graph.zoom() > MAX_FIT_ZOOM) {
    graph.zoom(MAX_FIT_ZOOM)
    graph.center()
  }
  graph.minZoom(fitMinZoom(graph.zoom()))
}

function graphStyle(
  palette: GraphPalette,
  font: string,
  { step, easing }: ReturnType<typeof readGraphTiming>,
): StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        shape: 'rectangle',
        width: 'data(width)',
        height: 'data(height)',
        'background-color': palette.paper,
        'border-width': 1.5,
        'border-color': palette.ink,
        'border-style': 'dotted',
        label: 'data(name)',
        'font-family': font,
        'font-size': 13,
        'font-weight': 700,
        color: palette.ink,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '128px',
        'text-overflow-wrap': 'anywhere',
        'min-zoomed-font-size': 5,
        'overlay-opacity': 0,
      },
    },
    { selector: 'node[kind = "character"]', style: { 'border-style': 'solid' } },
    { selector: 'node[kind = "place"]', style: { 'border-style': 'double' } },
    {
      selector: 'edge',
      style: {
        label: 'data(label)',
        width: 1,
        'line-color': palette.ink,
        'target-arrow-color': palette.ink,
        'target-arrow-shape': 'none',
        'arrow-scale': 0.65,
        'curve-style': 'bezier',
        'font-family': font,
        'font-size': 11,
        color: palette.ink,
        'text-background-color': palette.paper,
        'text-background-opacity': 1,
        'text-background-padding': '2px',
        'text-wrap': 'wrap',
        'text-max-width': '100px',
        'text-overflow-wrap': 'anywhere',
        'min-zoomed-font-size': 5,
        'overlay-opacity': 0,
      },
    },
    { selector: 'edge[?directed]', style: { 'target-arrow-shape': 'vee' } },
    { selector: '.dimmed', style: { opacity: 0.64 } },
    { selector: 'node.chosen', style: { 'background-color': palette.ink, color: palette.paper } },
    { selector: 'node.chosen, node.highlighted', style: { 'border-width': 2, opacity: 1 } },
    { selector: 'edge.chosen, edge.connected, edge.highlighted', style: { width: 2, opacity: 1 } },
    { selector: '.preview-dimmed', style: { opacity: 0.35 } },
    {
      selector: 'edge.outside-chapter',
      style: {
        'line-style': 'dotted',
        opacity: 0.26,
        'text-opacity': 0,
        'target-arrow-shape': 'none',
        events: 'no',
      },
    },
    { selector: '.hidden', style: { opacity: 0, events: 'no' } },
    {
      selector: '.animated',
      style: {
        'transition-property': 'opacity',
        'transition-duration': step,
        'transition-timing-function': easing,
      },
    },
  ]
}

function toElements(nodes: GraphNode[], edges: GraphEdge[], font: string): ElementDefinition[] {
  const text = document.createElement('canvas').getContext('2d')
  if (text) text.font = `700 13px ${font}`

  return [
    ...nodes.map((node) => {
      const length = text?.measureText(node.name).width ?? node.name.length * 13
      return {
        data: {
          id: node.id,
          name: node.name,
          kind: node.kind,
          width: Math.max(56, Math.min(144, Math.ceil(length) + 16)),
          height: Math.max(32, Math.ceil(length / 120) * 16 + 12),
        },
      }
    }),
    ...edges.map((e) => ({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.kind,
        directed: e.directed,
      },
    })),
  ]
}

function applyGraphState(
  cy: Core | null,
  visible: { nodeIds: Set<string>; edgeIds: Set<string> },
  selection: Selection,
) {
  if (!cy) return
  const active =
    selection && (selection.type === 'node' ? visible.nodeIds : visible.edgeIds).has(selection.id)
      ? selection
      : null
  const focused = active ? cy.getElementById(active.id) : null
  const connecting = focused?.isNode()
    ? focused.connectedEdges().filter((edge) => visible.edgeIds.has(edge.id()))
    : focused
  const relatedNodes = connecting?.connectedNodes().union(focused ?? cy.collection())

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      node.toggleClass('hidden', !visible.nodeIds.has(node.id()))
      node.toggleClass('chosen', active?.type === 'node' && node.id() === active.id)
      node.toggleClass('dimmed', Boolean(active && !relatedNodes?.contains(node)))
    })
    cy.edges().forEach((edge) => {
      const endpointsVisible =
        visible.nodeIds.has(edge.source().id()) && visible.nodeIds.has(edge.target().id())
      edge.toggleClass('hidden', !endpointsVisible)
      edge.toggleClass('outside-chapter', endpointsVisible && !visible.edgeIds.has(edge.id()))
      edge.toggleClass('chosen', active?.type === 'edge' && edge.id() === active.id)
      edge.toggleClass('connected', Boolean(active?.type === 'node' && connecting?.contains(edge)))
      edge.toggleClass('dimmed', Boolean(active && !connecting?.contains(edge)))
    })
  })
}

/** Relationship graph of the work with a chapter slider. cytoscape is loaded only in the browser. */
export function RelationGraph({
  workId,
  role,
  nodes,
  edges,
  latestPosition,
  intro,
  actions,
}: RelationGraphProps) {
  const router = useRouter()
  const canEdit = role === 'owner' || role === 'editor'
  const [position, setPosition] = useState(() => defaultPosition(latestPosition))
  const [showAll, setShowAll] = useState(false)
  const [hiddenKinds, setHiddenKinds] = useState<EntryKind[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const physicsRef = useRef<ReturnType<typeof createGraphPhysics> | null>(null)
  const [ready, setReady] = useState(false)
  const entered = useRef(false)
  const hoveredNode = useRef<string | null>(null)
  const focusedNode = useRef<string | null>(null)

  const kinds = useMemo(() => {
    const present = new Set(nodes.map((n) => n.kind))
    return ENTRY_KINDS.filter((k) => present.has(k))
  }, [nodes])

  const visible = useMemo(
    () => visibleGraph({ nodes, edges }, showAll ? null : position, hiddenKinds),
    [nodes, edges, showAll, position, hiddenKinds],
  )
  const graphStateRef = useRef({ visible, selection })

  useEffect(() => {
    graphStateRef.current = { visible, selection }
    applyGraphState(cyRef.current, visible, selection)
    physicsRef.current?.updateVisibility(visible)
  }, [visible, selection])

  // Mount cytoscape once per data set. The dynamic import keeps it out of the server render.
  useEffect(() => {
    let cancelled = false
    let cy: Core | null = null
    let physics: ReturnType<typeof createGraphPhysics> | undefined
    let sizeObserver: ResizeObserver | undefined
    async function mount() {
      const container = containerRef.current
      if (!container) return
      const [{ default: cytoscape }] = await Promise.all([
        import('cytoscape'),
        document.fonts.ready,
      ])
      if (cancelled) return
      const timing = readGraphTiming(container)
      const palette = readGraphPalette(container)
      const font = readGraphFont(container)
      cy = cytoscape({
        container,
        elements: toElements(nodes, edges, font),
        style: graphStyle(palette, font, timing),
        // Reserve backing pixels for live CSS zoom, which does not change devicePixelRatio.
        pixelRatio: window.devicePixelRatio * Math.max(1.25, container.currentCSSZoom || 1),
        maxZoom: 3,
        autounselectify: true,
        layout: circleLayout(nodes, edges),
      })
      // Fit and pointer handling need current dimensions before the renderer's debounced resize.
      sizeObserver = new ResizeObserver(() => cy?.resize())
      sizeObserver.observe(container)
      cy.on('tap', 'node', (e) => setSelection({ type: 'node', id: e.target.id() }))
      cy.on('tap', 'edge', (e) => setSelection({ type: 'edge', id: e.target.id() }))
      cy.on('tap', (e) => {
        if (e.target === cy) setSelection(null)
      })
      cy.on('mousemove', (e) => {
        hoveredNode.current = e.target !== cy && e.target.isNode() ? e.target.id() : null
        physics?.updatePreview(hoveredNode.current ?? focusedNode.current)
      })
      cyRef.current = cy
      setReady(true)
      const state = graphStateRef.current
      applyGraphState(cy, state.visible, state.selection)
      physics = createGraphPhysics(cy, container, state.visible, !entered.current)
      physicsRef.current = physics
      entered.current = true
    }
    void mount()
    return () => {
      cancelled = true
      cyRef.current = null
      physicsRef.current = null
      physics?.dispose()
      sizeObserver?.disconnect()
      cy?.destroy()
    }
  }, [nodes, edges])

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {intro}
        <EmptyState
          title="카드가 있어야 관계 그래프를 그릴 수 있어요."
          description="인물이나 세계관 탭에서 카드를 만드세요."
        />
      </div>
    )
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const edgeById = new Map(edges.map((e) => [e.id, e]))
  const activeSelection =
    selection &&
    (selection.type === 'node'
      ? visible.nodeIds.has(selection.id)
      : visible.edgeIds.has(selection.id))
      ? selection
      : null
  const selectedNode =
    activeSelection?.type === 'node' ? (nodeById.get(activeSelection.id) ?? null) : null
  const selectedEdge =
    activeSelection?.type === 'edge' ? (edgeById.get(activeSelection.id) ?? null) : null
  const visibleEdges = edges.filter((e) => visible.edgeIds.has(e.id))
  const visibleNodes = nodes.filter((n) => visible.nodeIds.has(n.id))

  function toggleKind(kind: EntryKind) {
    setHiddenKinds((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    )
  }

  async function archiveEdge(relationId: string) {
    const saved = await runAction(archiveRelationAction({ relationId }), {
      success: '관계를 보관했어요.',
    })
    if (saved) {
      setSelection(null)
      router.refresh()
    }
  }

  function zoomGraph(factor: number) {
    const graph = cyRef.current
    if (!graph) return
    graph.zoom({
      level: graph.zoom() * factor,
      renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 },
    })
  }

  function fitGraph(resetLayout = false) {
    const graph = cyRef.current
    if (!graph) return
    physicsRef.current?.arrange(() => {
      if (resetLayout) {
        graph.minZoom(0)
        graph.layout(circleLayout(nodes, edges)).run()
        return
      }
      const onPaper = graph.elements().not('.hidden')
      if (onPaper.empty()) return
      graph.minZoom(0)
      graph.fit(onPaper, 48)
      capFitZoom(graph)
    })
  }

  function previewNode(id: string | null, source: 'focus' | 'pointer') {
    const ref = source === 'focus' ? focusedNode : hoveredNode
    ref.current = id
    physicsRef.current?.updatePreview(hoveredNode.current ?? focusedNode.current)
  }

  const formKey = `${dialog ?? 'none'}-${selectedEdge?.id ?? selectedNode?.id ?? 'new'}`

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <GraphControls
        intro={intro}
        actions={
          (actions || canEdit) && (
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              {canEdit && <PopButton onClick={() => setDialog('create')}>관계 추가</PopButton>}
            </div>
          )
        }
        latestPosition={latestPosition}
        position={position}
        onPositionChange={setPosition}
        showAll={showAll}
        onShowAllChange={setShowAll}
        kinds={kinds}
        hiddenKinds={hiddenKinds}
        onToggleKind={toggleKind}
      />

      <div className="wg-graph-layout">
        <div className="flex min-w-0 flex-col gap-2">
          <div
            ref={containerRef}
            role="img"
            aria-label="관계 그래프"
            className="wg-graph-surface"
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') previewNode(null, 'pointer')
            }}
          />
          {visibleNodes.length === 0 && (
            <p role="status" className="b-label b-muted">
              조건에 맞는 카드가 없어요.
            </p>
          )}
          <div className="wg-graph-toolbar">
            <p className="text-xs text-muted-foreground">카드나 선을 눌러 자세히 보세요.</p>
            <div className="wg-graph-cells">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!ready}
                onClick={() => fitGraph()}
              >
                맞추기
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!ready}
                onClick={() => zoomGraph(1.25)}
              >
                확대
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!ready}
                onClick={() => zoomGraph(0.8)}
              >
                축소
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!ready}
                onClick={() => fitGraph(true)}
              >
                배치
              </Button>
            </div>
          </div>
        </div>

        <aside aria-label="선택한 항목" className="wg-graph-panel text-sm">
          {selectedNode && (
            <div key={selectedNode.id} className="wg-graph-selection flex flex-col gap-2">
              <p className="text-base font-medium">{selectedNode.name}</p>
              <p className="text-muted-foreground">
                {ENTRY_KIND_LABEL[selectedNode.kind]} ·{' '}
                {selectedNode.firstAppearance === null
                  ? '등장 기록 없음'
                  : `${selectedNode.firstAppearance}화에 처음 등장`}
              </p>
              <Link
                className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-fit' })}
                href={`/works/${workId}/wiki/entries/${selectedNode.id}`}
              >
                카드 열기
              </Link>
            </div>
          )}

          {selectedEdge && (
            <div key={selectedEdge.id} className="wg-graph-selection flex flex-col gap-2">
              <p className="text-base font-medium">
                {nodeById.get(selectedEdge.source)?.name} —{' '}
                {nodeById.get(selectedEdge.target)?.name}
              </p>
              <p className="text-muted-foreground">
                {selectedEdge.kind}
                {selectedEdge.directed ? ' (방향 있음)' : ''} ·{' '}
                {formatRelationRange(selectedEdge.startPosition, selectedEdge.endPosition)}
              </p>
              {selectedEdge.description && <p>{selectedEdge.description}</p>}
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDialog('edit')}>
                    수정
                  </Button>
                  <ConfirmButton
                    size="sm"
                    title="이 관계를 보관할까요?"
                    description="기록은 남아요. 그래프에서만 빠져요."
                    confirmLabel="보관"
                    onConfirm={() => archiveEdge(selectedEdge.id)}
                  >
                    보관
                  </ConfirmButton>
                </div>
              )}
            </div>
          )}

          {!selectedNode && !selectedEdge && (
            <p className="text-muted-foreground">그래프에서 카드나 관계를 고르세요.</p>
          )}

          <div className="wg-graph-roster">
            <p className="font-mono font-medium">카드 {visibleNodes.length}개</p>
            <ul className="wg-graph-list">
              {visibleNodes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="wg-graph-option"
                    aria-pressed={selectedNode?.id === n.id}
                    onFocus={(event) => {
                      if (event.currentTarget.matches(':focus-visible')) previewNode(n.id, 'focus')
                    }}
                    onBlur={() => previewNode(null, 'focus')}
                    onPointerEnter={(event) => {
                      if (event.pointerType === 'mouse') previewNode(n.id, 'pointer')
                    }}
                    onPointerLeave={(event) => {
                      if (event.pointerType === 'mouse') previewNode(null, 'pointer')
                    }}
                    onClick={() => setSelection({ type: 'node', id: n.id })}
                  >
                    <KindIcon kind={n.kind} />
                    <span>
                      {n.name}
                      <span className="wg-graph-option-meta"> · {ENTRY_KIND_LABEL[n.kind]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="wg-graph-roster">
            <p className="font-mono font-medium">관계 {visibleEdges.length}개</p>
            <ul className="wg-graph-list">
              {visibleEdges.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="wg-graph-option"
                    aria-pressed={selectedEdge?.id === e.id}
                    onClick={() => setSelection({ type: 'edge', id: e.id })}
                  >
                    {nodeById.get(e.source)?.name} {e.directed ? '→' : '—'}{' '}
                    {nodeById.get(e.target)?.name}
                    <span className="wg-graph-option-meta"> · {e.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog === 'edit' ? '관계 수정' : '관계 추가'}</DialogTitle>
            <DialogDescription>두 카드 사이의 관계와 이어지는 회차를 적어요.</DialogDescription>
          </DialogHeader>
          {dialog !== null && (
            <RelationForm
              key={formKey}
              workId={workId}
              nodes={nodes}
              relation={dialog === 'edit' ? (selectedEdge ?? undefined) : undefined}
              defaultSourceId={selectedNode?.id ?? null}
              onDone={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
