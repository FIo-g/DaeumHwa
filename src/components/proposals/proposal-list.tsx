'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { runAction } from '@/lib/client/run-action'
import { chapterLabel } from '@/lib/labels'
import { bulkApproveAction } from '@/server/actions/proposals'
import type { ProposalView } from '@/server/proposals'
import { ProposalCard, type ProposalChapterOption } from './proposal-card'

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
  const [busy, setBusy] = useState(false)
  const [shownGroups, setShownGroups] = useState(GROUP_PAGE_SIZE)

  const visible = useMemo(() => proposals.filter((p) => !done.has(p.id)), [proposals, done])
  const visibleIds = useMemo(() => new Set(visible.map((p) => p.id)), [visible])
  const groups = useMemo(
    () => buildGroups(visible, grouping, chapters),
    [visible, grouping, chapters],
  )

  const markDone = useCallback((ids: string[]) => {
    setDone((prev) => new Set([...prev, ...ids]))
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
  }, [])
  const handleDone = useCallback((id: string) => markDone([id]), [markDone])

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function approveIds(ids: string[]) {
    if (ids.length === 0 || busy) return
    setBusy(true)
    const data = await runAction(bulkApproveAction({ workId, proposalIds: ids }))
    setBusy(false)
    if (!data) return
    const failedIds = new Set(data.failed.map((f) => f.proposalId))
    markDone(ids.filter((id) => !failedIds.has(id)))
    if (data.approved > 0) toast.success(`${data.approved}건을 승인했습니다.`)
    if (data.failed.length > 0) toast.error(`${data.failed.length}건은 승인하지 못했습니다.`)
  }

  if (visible.length === 0) {
    return <EmptyState title="승인 대기 중인 제안이 없습니다." />
  }

  const selectedIds = [...selected].filter((id) => visibleIds.has(id))
  const shown = groups.slice(0, shownGroups)

  return (
    <div className="grid gap-6">
      {selectable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => approveIds(selectedIds)}
            disabled={busy || selectedIds.length === 0}
          >
            선택 승인 ({selectedIds.length})
          </Button>
          <span className="text-sm text-muted-foreground">전체 {visible.length}건</span>
        </div>
      )}

      {shown.map((group) => (
        <section key={group.key} className="grid gap-3" aria-label={group.label}>
          <div className="flex flex-wrap items-center justify-between gap-2">
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
          </div>
          {group.items.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              {selectable && (
                <Checkbox
                  className="mt-4"
                  aria-label="이 제안 선택"
                  checked={selected.has(item.id)}
                  onCheckedChange={(on) => toggle(item.id, on)}
                />
              )}
              <div className="min-w-0 flex-1">
                <MemoProposalCard
                  proposal={item}
                  workId={workId}
                  chapters={chapters}
                  onDone={handleDone}
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
