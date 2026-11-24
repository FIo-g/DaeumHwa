'use client'

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Reveal, usePrefersReducedMotion } from '@/components/motion'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { runAction } from '@/lib/client/run-action'
import { chapterLabel } from '@/lib/labels'
import { bulkApproveAction } from '@/server/actions/proposals'
import type { ProposalView } from '@/server/proposals'
import { ProposalCard, type ProposalChapterOption, type ProposalDecision } from './proposal-card'

type ProposalListProps = {
  proposals: ProposalView[]
  workId: string
  chapters: ProposalChapterOption[]
  /** 'entity' groups by the card or thread a proposal is about; 'chapter' groups by chapter. */
  grouping: 'entity' | 'chapter'
  selectable?: boolean
}

type Group = { key: string; label: string; items: ProposalView[] }

/** Groups rendered at once. The rest load on "더 보기", so a big import does not mount everything. */
const GROUP_PAGE_SIZE = 20

// Cards keep their own edit state; memo stops an approval elsewhere in the list from re-rendering them.
const MemoProposalCard = memo(ProposalCard)

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
}: ProposalListProps) {
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [snapshot, setSnapshot] = useState<ProposalView[] | null>(null)
  const [decisions, setDecisions] = useState<Map<string, ProposalDecision> | null>(null)
  const [shownGroups, setShownGroups] = useState(GROUP_PAGE_SIZE)
  const reducedMotion = usePrefersReducedMotion()
  const list = useRef<HTMLDivElement>(null)
  const locked = useRef(false)
  const positions = useRef<Map<string, number> | null>(null)
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

  const finish = useCallback(
    (id: string, decision: ProposalDecision | null) => {
      if (decision) setDecisions(new Map([[id, decision]]))
      else release()
    },
    [release],
  )

  useEffect(() => {
    if (!decisions) return
    const node = list.current
    if (!node) return
    const token = getComputedStyle(node).getPropertyValue('--b-scene').trim()
    const duration = parseFloat(token) * (token.endsWith('ms') ? 1 : 1000)
    const timer = window.setTimeout(
      () => {
        if (!reducedMotion) {
          positions.current = new Map(
            Array.from(node.querySelectorAll<HTMLElement>('[data-proposal-row]'), (row) => [
              row.dataset.proposalRow!,
              row.getBoundingClientRect().top,
            ]),
          )
        }
        setDone((prev) => new Set([...prev, ...decisions.keys()]))
        setSelected((prev) => new Set([...prev].filter((id) => !decisions.has(id))))
        setDecisions(null)
        release()
      },
      reducedMotion ? 0 : duration || 0,
    )
    return () => window.clearTimeout(timer)
  }, [decisions, reducedMotion, release])

  useLayoutEffect(() => {
    const node = list.current
    if (!node || busy) return
    const previous = positions.current
    positions.current = null
    if (previous && !reducedMotion) {
      const moved = Array.from(node.querySelectorAll<HTMLElement>('[data-proposal-row]'))
        .filter((row) => !row.querySelector('[data-editing="true"]'))
        .map((row) => ({
          row,
          distance:
            (previous.get(row.dataset.proposalRow!) ?? row.getBoundingClientRect().top) -
            row.getBoundingClientRect().top,
        }))
        .filter(({ distance }) => distance !== 0)
      for (const { row, distance } of moved) {
        row.style.transition = 'none'
        row.style.translate = `0 ${distance}px`
      }
      if (moved.length > 0) node.getBoundingClientRect()
      for (const { row } of moved) {
        row.style.transition = ''
        row.style.translate = ''
      }
    }

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
  }, [busy, reducedMotion, done])

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function approveIds(ids: string[]) {
    if (ids.length === 0 || !begin()) return
    const data = await runAction(bulkApproveAction({ workId, proposalIds: ids }))
    if (!data) {
      release()
      return
    }
    const failedIds = new Set(data.failed.map((f) => f.proposalId))
    const approved = ids.filter((id) => !failedIds.has(id))
    if (approved.length > 0) setDecisions(new Map(approved.map((id) => [id, 'approved'])))
    else release()
    if (data.approved > 0) toast.success(`${data.approved}건을 승인했어요.`)
    if (data.failed.length > 0) toast.error(`${data.failed.length}건을 승인하지 못했어요.`)
  }

  const selectedIds = [...selected].filter((id) => visibleIds.has(id))
  const shown = groups.slice(0, shownGroups)

  return (
    <div className="b-works-queue" ref={list} tabIndex={-1}>
      {visible.length === 0 && <EmptyState title="승인 대기 중인 제안이 없어요." />}
      {selectable && visible.length > 0 && (
        <div className="b-works-selection">
          <Button
            size="sm"
            onClick={() => approveIds(selectedIds)}
            disabled={busy || selectedIds.length === 0}
          >
            선택 승인{' '}
            <span key={selectedIds.length} className="b-works-selection-count">
              ({selectedIds.length})
            </span>
          </Button>
          <span className="text-sm text-muted-foreground">전체 {visible.length}건</span>
        </div>
      )}

      {shown.map((group) => (
        <section key={group.key} className="b-works-proposal-group" aria-label={group.label}>
          <Reveal effectOnly className="b-works-group-head">
            <h2 className="font-semibold">
              {group.label}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {group.items.length}건
              </span>
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => approveIds(group.items.map((p) => p.id))}
              disabled={busy}
            >
              이 묶음 승인
            </Button>
          </Reveal>
          {group.items.map((item) => (
            <div
              key={item.id}
              className="b-works-proposal-row"
              data-proposal-row={item.id}
              data-selected={selected.has(item.id)}
              tabIndex={-1}
            >
              {selectable && (
                <Checkbox
                  className="mt-4"
                  aria-label="이 제안 선택"
                  checked={selected.has(item.id)}
                  disabled={busy}
                  onCheckedChange={(on) => toggle(item.id, on)}
                />
              )}
              <div className="min-w-0 flex-1">
                <MemoProposalCard
                  proposal={item}
                  workId={workId}
                  chapters={chapters}
                  queueBusy={busy}
                  decision={decisions?.get(item.id)}
                  onBeginDecision={begin}
                  onFinishDecision={finish}
                />
              </div>
            </div>
          ))}
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
