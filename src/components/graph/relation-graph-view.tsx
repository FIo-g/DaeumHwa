'use client'

import Link from 'next/link'
import { useCallback, useMemo, useRef, useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { Button, buttonVariants } from '@/components/ui/button'
import type { EntryKind } from '@/db/types'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import type { GraphViewData } from '@/server/relations'
import { relationKindColor } from './force-graph-renderer'
import { GraphControls } from './graph-controls'
import { createForceGraphData, defaultPosition, formatRelationRange } from './graph-model'
import { GraphViewport } from './graph-viewport'

type RelationGraphViewProps = GraphViewData & { workId: string }
type Selection = { type: 'node' | 'edge'; id: string } | null

const initiallyHiddenKinds: EntryKind[] = ['organization', 'item', 'rule', 'term', 'other']

export function RelationGraphView({
  workId,
  nodes,
  edges,
  latestPosition,
}: RelationGraphViewProps) {
  const [position, setPosition] = useState(() => defaultPosition(latestPosition))
  const [showAll, setShowAll] = useState(false)
  const [hiddenKinds, setHiddenKinds] = useState(initiallyHiddenKinds)
  const [selection, setSelection] = useState<Selection>(null)
  const detailsRef = useRef<HTMLElement>(null)
  const [mode, setMode] = useState<'3d' | '2d'>('3d')
  const [unavailable3D, setUnavailable3D] = useState(false)
  const renderMode = unavailable3D ? '2d' : mode
  const chapter = showAll ? null : Math.min(position, defaultPosition(latestPosition))

  const kinds = useMemo(() => [...new Set(nodes.map((node) => node.kind))], [nodes])
  const nodeNames = useMemo(() => new Map(nodes.map((node) => [node.id, node.name])), [nodes])
  const graph = useMemo(() => {
    // A different renderer needs fresh data because force-graph mutates nodes and links.
    const data = createForceGraphData({ nodes, edges }, chapter, hiddenKinds)
    const nodeIds = new Set(data.nodes.map(({ id }) => id))
    const edgeIds = new Set(data.links.map(({ id }) => id))
    return {
      data,
      mode: renderMode,
      visibleNodes: nodes.filter(({ id }) => nodeIds.has(id)),
      visibleEdges: edges.filter(({ id }) => edgeIds.has(id)),
    }
  }, [chapter, edges, hiddenKinds, nodes, renderMode])

  const selectNode = useCallback((id: string) => setSelection({ type: 'node', id }), [])
  const selectEdge = useCallback((id: string) => setSelection({ type: 'edge', id }), [])
  const clearSelection = useCallback(() => setSelection(null), [])
  const disable3D = useCallback(() => setUnavailable3D(true), [])
  const revealDetails = useCallback(() => {
    if (window.matchMedia('(width < 64rem)').matches) {
      detailsRef.current?.scrollIntoView({ block: 'start' })
    }
  }, [])
  const selectNodeFromCanvas = useCallback(
    (id: string) => {
      selectNode(id)
      revealDetails()
    },
    [selectNode, revealDetails],
  )
  const selectEdgeFromCanvas = useCallback(
    (id: string) => {
      selectEdge(id)
      revealDetails()
    },
    [selectEdge, revealDetails],
  )

  function toggleKind(kind: EntryKind) {
    setHiddenKinds((current) =>
      current.includes(kind) ? current.filter((value) => value !== kind) : [...current, kind],
    )
  }

  const selectedNode =
    selection?.type === 'node' ? graph.visibleNodes.find(({ id }) => id === selection.id) : null
  const selectedEdge =
    selection?.type === 'edge' ? graph.visibleEdges.find(({ id }) => id === selection.id) : null

  if (nodes.length === 0) {
    return (
      <EmptyState
        title="카드를 먼저 만들면 관계 그래프가 그려집니다."
        action={
          <Link href={`/works/${workId}/wiki`} className={buttonVariants({ variant: 'outline' })}>
            설정 보드로 가기
          </Link>
        }
      />
    )
  }

  function edgeTitle(edge: GraphViewData['edges'][number]) {
    return `${nodeNames.get(edge.source)} ${edge.directed ? '→' : '—'} ${nodeNames.get(edge.target)}`
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="그래프 보기 방식" className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={renderMode === '3d' ? 'default' : 'outline'}
            aria-pressed={renderMode === '3d'}
            disabled={unavailable3D}
            onClick={() => setMode('3d')}
          >
            3D
          </Button>
          <Button
            type="button"
            size="sm"
            variant={renderMode === '2d' ? 'default' : 'outline'}
            aria-pressed={renderMode === '2d'}
            onClick={() => setMode('2d')}
          >
            2D
          </Button>
        </div>
        {unavailable3D && (
          <p role="status" className="text-xs text-muted-foreground">
            3D 그래프를 불러오지 못해 2D로 표시합니다.
          </p>
        )}
      </div>

      <GraphControls
        latestPosition={latestPosition}
        position={position}
        onPositionChange={setPosition}
        positionSuffix="화 기준"
        showAll={showAll}
        onShowAllChange={setShowAll}
        kinds={kinds}
        hiddenKinds={hiddenKinds}
        onToggleKind={toggleKind}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]">
        <GraphViewport
          mode={graph.mode}
          data={graph.data}
          onNodeSelect={selectNodeFromCanvas}
          onLinkSelect={selectEdgeFromCanvas}
          onBackgroundSelect={clearSelection}
          on3DUnavailable={disable3D}
        />

        <aside
          ref={detailsRef}
          aria-label="카드 및 관계"
          className="flex min-w-0 scroll-mt-4 flex-col gap-4 rounded-xl border p-4 text-sm break-keep [overflow-wrap:anywhere]"
        >
          <div aria-live="polite">
            {selectedNode && (
              <div className="flex flex-col gap-2">
                <h2 className="text-base font-medium">{selectedNode.name}</h2>
                <p className="text-muted-foreground">
                  {ENTRY_KIND_LABEL[selectedNode.kind]} ·{' '}
                  {selectedNode.firstAppearance === null
                    ? '등장 기록 없음'
                    : `${selectedNode.firstAppearance}화에 처음 등장`}
                </p>
                <p className="whitespace-pre-wrap">{selectedNode.summary || '요약이 없습니다.'}</p>
                <Link
                  href={`/works/${workId}/wiki/entries/${selectedNode.id}`}
                  className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-fit' })}
                >
                  카드 열기
                </Link>
              </div>
            )}

            {selectedEdge && (
              <div className="flex flex-col gap-2">
                <h2 className="text-base font-medium">{edgeTitle(selectedEdge)}</h2>
                <p>{selectedEdge.kind}</p>
                {selectedEdge.description && (
                  <p className="whitespace-pre-wrap">{selectedEdge.description}</p>
                )}
                <dl className="grid gap-2">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">근거 회차</dt>
                    <dd>
                      {selectedEdge.evidenceChapter
                        ? `${selectedEdge.evidenceChapter.position}화 · ${selectedEdge.evidenceChapter.title}`
                        : '등록된 근거 회차가 없습니다.'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">유효 회차</dt>
                    <dd>
                      {formatRelationRange(selectedEdge.startPosition, selectedEdge.endPosition)}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {!selectedNode && !selectedEdge && (
              <p className="text-muted-foreground">
                {graph.visibleNodes.length === 0
                  ? '회차나 카드 종류를 바꿔 보세요.'
                  : '그래프나 목록에서 카드나 관계를 고르세요.'}
              </p>
            )}
          </div>

          <section aria-label="표시된 카드" className="flex flex-col gap-2 border-t pt-4">
            <h2 className="font-medium">카드 {graph.visibleNodes.length}개</h2>
            <ul className="max-h-40 space-y-1 overflow-y-auto p-0.5">
              {graph.visibleNodes.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted"
                    aria-pressed={selectedNode?.id === node.id}
                    onClick={() => selectNode(node.id)}
                  >
                    {node.name}
                    <span className="text-muted-foreground"> · {ENTRY_KIND_LABEL[node.kind]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="표시된 관계" className="flex flex-col gap-2 border-t pt-4">
            <h2 className="font-medium">관계 {graph.visibleEdges.length}개</h2>
            {graph.visibleEdges.length === 0 ? (
              <p className="text-muted-foreground">표시할 관계가 없습니다.</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto p-0.5">
                {graph.visibleEdges.map((edge) => (
                  <li key={edge.id}>
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted"
                      aria-pressed={selectedEdge?.id === edge.id}
                      onClick={() => selectEdge(edge.id)}
                    >
                      <span
                        aria-hidden="true"
                        className="mr-1.5 inline-block h-0.5 w-3 align-middle"
                        style={{ backgroundColor: relationKindColor(edge.kind) }}
                      />
                      {edgeTitle(edge)}
                      <span className="text-muted-foreground"> · {edge.kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
