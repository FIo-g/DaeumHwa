'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Core, ElementDefinition, StylesheetStyle } from 'cytoscape'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EntryKind, Role } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import { archiveRelationAction } from '@/server/actions/relations'
import {
  ENTRY_KIND_COLOR,
  type GraphEdge,
  type GraphNode,
  defaultPosition,
  formatRelationRange,
  visibleGraph,
} from './graph-model'
import { GraphControls } from './graph-controls'
import { RelationForm } from './relation-form'

type RelationGraphProps = {
  workId: string
  role: Role
  nodes: GraphNode[]
  edges: GraphEdge[]
  latestPosition: number
}

type Selection = { type: 'node' | 'edge'; id: string } | null

const GRAPH_STYLE: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      width: 26,
      height: 26,
      label: 'data(name)',
      'font-size': 11,
      color: '#0f172a',
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
      'border-width': 0,
    },
  },
  {
    selector: 'edge',
    style: {
      label: 'data(label)',
      width: 2,
      'line-color': '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'none',
      'curve-style': 'bezier',
      'font-size': 10,
      color: '#334155',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.9,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'edge[?directed]',
    style: { 'target-arrow-shape': 'triangle' },
  },
  { selector: ':selected', style: { 'border-width': 3, 'border-color': '#0f172a' } },
  { selector: '.hidden', style: { display: 'none' } },
]

function toElements(nodes: GraphNode[], edges: GraphEdge[]): ElementDefinition[] {
  return [
    ...nodes.map((n) => ({
      data: { id: n.id, name: n.name, color: ENTRY_KIND_COLOR[n.kind] },
    })),
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

function applyVisibility(
  cy: Core | null,
  visible: { nodeIds: Set<string>; edgeIds: Set<string> },
): void {
  if (!cy) return
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      n.toggleClass('hidden', !visible.nodeIds.has(n.id()))
    })
    cy.edges().forEach((e) => {
      e.toggleClass('hidden', !visible.edgeIds.has(e.id()))
    })
  })
}

/** Relationship graph of the work with a chapter slider. cytoscape is loaded only in the browser. */
export function RelationGraph({ workId, role, nodes, edges, latestPosition }: RelationGraphProps) {
  const router = useRouter()
  const canEdit = role === 'owner' || role === 'editor'
  const [position, setPosition] = useState(() => defaultPosition(latestPosition))
  const [showAll, setShowAll] = useState(false)
  const [hiddenKinds, setHiddenKinds] = useState<EntryKind[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)

  const kinds = useMemo(() => {
    const present = new Set(nodes.map((n) => n.kind))
    return (Object.keys(ENTRY_KIND_COLOR) as EntryKind[]).filter((k) => present.has(k))
  }, [nodes])

  const visible = useMemo(
    () => visibleGraph({ nodes, edges }, showAll ? null : position, hiddenKinds),
    [nodes, edges, showAll, position, hiddenKinds],
  )
  const visibleRef = useRef(visible)

  useEffect(() => {
    visibleRef.current = visible
    applyVisibility(cyRef.current, visible)
  }, [visible])

  // Mount cytoscape once per data set. The dynamic import keeps it out of the server render.
  useEffect(() => {
    let cancelled = false
    let cy: Core | null = null
    async function mount() {
      const container = containerRef.current
      if (!container) return
      const { default: cytoscape } = await import('cytoscape')
      if (cancelled) return
      cy = cytoscape({
        container,
        elements: toElements(nodes, edges),
        style: GRAPH_STYLE,
        layout: { name: 'cose', animate: false, fit: true, padding: 24 },
      })
      cy.on('tap', 'node', (e) => setSelection({ type: 'node', id: e.target.id() }))
      cy.on('tap', 'edge', (e) => setSelection({ type: 'edge', id: e.target.id() }))
      cy.on('tap', (e) => {
        if (e.target === cy) setSelection(null)
      })
      cyRef.current = cy
      applyVisibility(cy, visibleRef.current)
    }
    void mount()
    return () => {
      cancelled = true
      cyRef.current = null
      cy?.destroy()
    }
  }, [nodes, edges])

  if (nodes.length === 0) {
    return (
      <EmptyState
        title="카드를 먼저 만들면 관계 그래프가 그려집니다."
        action={
          <Link className={buttonVariants({ variant: 'outline' })} href={`/works/${workId}/wiki`}>
            설정 보드로 가기
          </Link>
        }
      />
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
      success: '관계를 보관했습니다.',
    })
    if (saved) {
      setSelection(null)
      router.refresh()
    }
  }

  const formKey = `${dialog ?? 'none'}-${selectedEdge?.id ?? selectedNode?.id ?? 'new'}`

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={() => setDialog('create')}>관계 추가</Button>
          </div>
        )}
        <GraphControls
          latestPosition={latestPosition}
          position={position}
          onPositionChange={setPosition}
          showAll={showAll}
          onShowAllChange={setShowAll}
          kinds={kinds}
          hiddenKinds={hiddenKinds}
          onToggleKind={toggleKind}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-2">
          <div
            ref={containerRef}
            role="img"
            aria-label="관계 그래프"
            className="h-[60vh] min-h-72 w-full rounded-xl border bg-background"
          />
          <p className="text-xs text-muted-foreground">
            카드를 누르면 카드 정보를, 선을 누르면 관계를 봅니다.
          </p>
        </div>

        <aside
          aria-label="선택한 항목"
          className="flex flex-col gap-4 rounded-xl border p-4 text-sm"
        >
          {selectedNode && (
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
                    description="보관해도 기록은 남고, 그래프에서만 사라집니다."
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

          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="font-medium">카드 {visibleNodes.length}개</p>
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {visibleNodes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-muted"
                    aria-pressed={selectedNode?.id === n.id}
                    onClick={() => setSelection({ type: 'node', id: n.id })}
                  >
                    {n.name}
                    <span className="text-muted-foreground"> · {ENTRY_KIND_LABEL[n.kind]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="font-medium">관계 {visibleEdges.length}개</p>
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {visibleEdges.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-muted"
                    aria-pressed={selectedEdge?.id === e.id}
                    onClick={() => setSelection({ type: 'edge', id: e.id })}
                  >
                    {nodeById.get(e.source)?.name} {e.directed ? '→' : '—'}{' '}
                    {nodeById.get(e.target)?.name}
                    <span className="text-muted-foreground"> · {e.kind}</span>
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
            <DialogDescription>
              두 카드 사이의 관계와 그 관계가 이어지는 회차를 적습니다.
            </DialogDescription>
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
