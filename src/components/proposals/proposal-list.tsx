'use client'

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { CountCell, usePrefersReducedMotion } from '@/components/motion'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { runAction } from '@/lib/client/run-action'
import { chapterLabel } from '@/lib/labels'
import { bulkApproveAction } from '@/server/actions/proposals'
import type { BulkApproveInput, ProposalView } from '@/server/proposals'
import { ProposalCard, type ProposalChapterOption, type ProposalDecision } from './proposal-card'

type ProposalListProps = {
  proposals: ProposalView[]
  workId: string
  chapters: ProposalChapterOption[]
  /** 'entity' groups by the card or thread a proposal is about; 'chapter' groups by chapter. */
  grouping: 'entity' | 'chapter'
  selectable?: boolean
  importBatches?: ImportBatch[]
}

type Group = { key: string; label: string; items: ProposalView[] }
type ImportBatch = { sourceRef: string; count: number }
type DecisionScene = { outcome: ProposalDecision; indices: Map<string, number> }

/** Groups rendered at once. The rest load on "더 보기", so a big import does not mount everything. */
const GROUP_PAGE_SIZE = 20

// Cards keep their own edit state; memo stops an approval elsewhere in the list from re-rendering them.
const MemoProposalCard = memo(ProposalCard)

function readTime(style: CSSStyleDeclaration, token: string) {
  const value = style.getPropertyValue(token).trim()
  return (parseFloat(value) || 0) * (value.endsWith('ms') ? 1 : 1000)
}

function ImportApproval({
  batch,
  busy,
  onApprove,
}: {
  batch: ImportBatch
  busy: boolean
  onApprove: (sourceRef: string) => Promise<void>
}) {
  const router = useRouter()
  return (
    <section aria-label="원고 가져오기 제안" className="wg-approvals-batch">
      <p className="font-medium">원고 가져오기 제안 {batch.count}건</p>
      <ConfirmButton
        title={`제안 ${batch.count}건을 모두 승인할까요?`}
        description="기본 태그가 붙어 위키에 바로 반영돼요."
        confirmLabel="승인"
        disabled={busy}
        onConfirm={async () => {
          await onApprove(batch.sourceRef)
          router.refresh()
        }}
      >
        이 가져오기의 제안 모두 승인
      </ConfirmButton>
    </section>
  )
}

function chapterLabelOf(item: ProposalView, chapters: ProposalChapterOption[]): string {
  const chapter = item.chapterId ? chapters.find((c) => c.id === item.chapterId) : undefined
  if (chapter) return chapterLabel(chapter.position, chapter.title)
  return item.chapterPosition !== null
    ? chapterLabel(item.chapterPosition, item.chapterTitle)
    : '회차 없음'
}

function buildGroups(
  items: ProposalView[],
  grouping: 'entity' | 'chapter',
  chapters: ProposalChapterOption[],
): Group[] {
  const groups = new Map<string, Group>()
  for (const item of items) {
    const key = grouping === 'entity' ? item.groupKey : `chapter:${item.chapterId ?? 'none'}`
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      groups.set(key, {
        key,
        label: grouping === 'entity' ? item.groupLabel : chapterLabelOf(item, chapters),
        items: [item],
      })
    }
  }
  const list = [...groups.values()]
  if (grouping === 'chapter') {
    const position = (g: Group) => g.items[0].chapterPosition ?? Number.MAX_SAFE_INTEGER
    list.sort((a, b) => position(a) - position(b))
  }
  return list
}

/** Approval queue: grouped proposals, optional selection, and bulk approval. */
export function ProposalList({
  proposals,
  workId,
  chapters,
  grouping,
  selectable = false,
  importBatches = [],
}: ProposalListProps) {
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [snapshot, setSnapshot] = useState<ProposalView[] | null>(null)
  const [scene, setScene] = useState<DecisionScene | null>(null)
  const [shownGroups, setShownGroups] = useState(GROUP_PAGE_SIZE)
  const reducedMotion = usePrefersReducedMotion()
  const list = useRef<HTMLDivElement>(null)
  const locked = useRef(false)
  const actionFocus = useRef<HTMLElement | null>(null)
  const busy = snapshot !== null

  const visible = useMemo(
    () => (snapshot ?? proposals).filter((p) => !done.has(p.id)),
    [snapshot, proposals, done],
  )
  const visibleIds = useMemo(() => new Set(visible.map((p) => p.id)), [visible])
  const groups = useMemo(
    () => buildGroups(visible, grouping, chapters),
    [visible, grouping, chapters],
  )

  const begin = useCallback(() => {
    if (locked.current) return false
    locked.current = true
    const focused = document.activeElement
    actionFocus.current =
      focused instanceof HTMLElement && list.current?.contains(focused) ? focused : null
    // The action may refresh the server props before its result reaches the card.
    setSnapshot(proposals)
    return true
  }, [proposals])

  const release = useCallback(() => {
    locked.current = false
    setSnapshot(null)
  }, [])

  const markDecisions = useCallback((ids: string[], outcome: ProposalDecision) => {
    const requested = new Set(ids)
    const indices = new Map<string, number>()
    for (const row of list.current?.querySelectorAll<HTMLElement>('[data-proposal-row]') ?? []) {
      const id = row.dataset.proposalRow
      if (id && requested.delete(id)) indices.set(id, indices.size)
    }
    for (const id of requested) indices.set(id, -1)
    setScene({ outcome, indices })
  }, [])

  const finish = useCallback(
    (id: string, decision: ProposalDecision | null) => {
      if (decision) markDecisions([id], decision)
      else release()
    },
    [markDecisions, release],
  )

  useEffect(() => {
    const node = list.current
    if (!scene || !node) return
    const style = getComputedStyle(node)
    const duration =
      readTime(style, '--b-draw') + readTime(style, '--b-quick') + readTime(style, '--b-step')
    const stagger = readTime(style, '--b-stagger')
    const idsByDelay = new Map<number, string[]>()
    for (const [id, index] of scene.indices) {
      const delay = reducedMotion || index < 0 ? 0 : duration + index * stagger
      const ids = idsByDelay.get(delay)
      if (ids) ids.push(id)
      else idsByDelay.set(delay, [id])
    }
    const end = Math.max(...idsByDelay.keys())
    const timers = Array.from(idsByDelay, ([delay, ids]) =>
      window.setTimeout(() => {
        setDone((prev) => new Set([...prev, ...ids]))
        if (delay !== end) return
        setSelected((prev) => new Set([...prev].filter((id) => !scene.indices.has(id))))
        setScene(null)
        release()
      }, delay),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [scene, reducedMotion, release])

  useLayoutEffect(() => {
    const node = list.current
    if (!node || busy) return
    const focused = actionFocus.current
    actionFocus.current = null
    if (focused && document.activeElement === document.body) {
      const target =
        focused.isConnected && !focused.matches(':disabled')
          ? focused
          : node.querySelector<HTMLElement>('[data-proposal-row]')
      const focusTarget = target ?? node
      focusTarget.focus()
    }
  }, [busy])

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function approveMany(input: Pick<BulkApproveInput, 'proposalIds' | 'sourceRef'>) {
    if (input.proposalIds?.length === 0 || !begin()) return
    const ids =
      input.proposalIds ??
      visible.filter((item) => item.sourceRef === input.sourceRef).map((p) => p.id)
    const data = await runAction(bulkApproveAction({ workId, ...input }))
    if (!data) {
      release()
      return
    }
    const failedIds = new Set(data.failed.map((f) => f.proposalId))
    const approved = ids.filter((id) => !failedIds.has(id))
    if (approved.length > 0) markDecisions(approved, 'approved')
    else release()
    if (data.approved > 0) toast.success(`${data.approved}건을 승인했어요.`)
    if (data.failed.length > 0) toast.error(`${data.failed.length}건을 승인하지 못했어요.`)
  }

  const selectedIds = [...selected].filter((id) => visibleIds.has(id))
  const shown = groups.slice(0, shownGroups)
  const entryIndices = new Map(shown.flatMap((group) => group.items).map(({ id }, i) => [id, i]))

  return (
    <div className="wg-approvals-queue" ref={list} tabIndex={-1}>
      {importBatches.map((batch) => (
        <ImportApproval
          key={batch.sourceRef}
          batch={batch}
          busy={busy}
          onApprove={(sourceRef) => approveMany({ sourceRef })}
        />
      ))}
      {visible.length === 0 && <EmptyState title="승인 대기 중인 제안이 없어요." />}
      {selectable && visible.length > 0 && (
        <div className="wg-approvals-selection">
          <Button
            onClick={() => approveMany({ proposalIds: selectedIds })}
            disabled={busy || selectedIds.length === 0}
          >
            선택 승인 <span className="font-mono">({selectedIds.length})</span>
          </Button>
          <span className="text-sm text-muted-ink">
            전체 <span className="font-mono">{visible.length}</span>건
          </span>
        </div>
      )}

      {shown.map((group) => (
        <section key={group.key} className="wg-approvals-group" aria-label={group.label}>
          <div className="wg-approvals-group-head">
            <h2
              className="wg-approvals-group-title"
              aria-label={`${group.label} ${group.items.length}건`}
            >
              {group.label}{' '}
              <span className="wg-approvals-group-count">
                <CountCell value={group.items.length} />건
              </span>
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => approveMany({ proposalIds: group.items.map((p) => p.id) })}
              disabled={busy}
            >
              이 묶음 승인
            </Button>
          </div>
          {group.items.map((item, index) => {
            const decisionIndex = scene?.indices.get(item.id)
            const outcome = decisionIndex === undefined ? undefined : scene?.outcome
            return (
              <div
                key={item.id}
                className="wg-approvals-row"
                data-proposal-row={item.id}
                data-selected={selected.has(item.id) || undefined}
                data-decision={outcome}
                style={
                  {
                    '--wg-approvals-entry-index': Math.min(entryIndices.get(item.id) ?? 0, 3),
                    '--wg-approvals-decision-index': decisionIndex,
                  } as CSSProperties
                }
                tabIndex={-1}
              >
                <div className="wg-approvals-gutter">
                  <span className="wg-approvals-line-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {selectable && (
                    <Checkbox
                      aria-label="이 제안 선택"
                      checked={selected.has(item.id)}
                      disabled={busy}
                      onCheckedChange={(on) => toggle(item.id, on)}
                    />
                  )}
                  {outcome === 'approved' && (
                    <svg className="wg-approvals-check" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 13 Q6 14 9 19 Q13 11 21 4" pathLength="1" />
                    </svg>
                  )}
                </div>
                <MemoProposalCard
                  proposal={item}
                  workId={workId}
                  chapters={chapters}
                  queueBusy={busy}
                  decision={outcome}
                  onBeginDecision={begin}
                  onFinishDecision={finish}
                />
                {outcome === 'rejected' && (
                  <svg
                    className="wg-approvals-strike"
                    viewBox="0 0 100 12"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path d="M0 9 Q45 5 100 3" pathLength="1" />
                  </svg>
                )}
              </div>
            )
          })}
        </section>
      ))}

      {groups.length > shownGroups && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setShownGroups((n) => n + GROUP_PAGE_SIZE)}>
            더 보기 (남은 {groups.length - shownGroups}묶음)
          </Button>
        </div>
      )}
    </div>
  )
}
