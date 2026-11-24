'use client'

import { ChevronDownIcon } from 'lucide-react'
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { HandNote, MenuSheet, PopButton } from '@/components/motion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { THREAD_STATUSES, type Role, type ThreadStatus } from '@/db/types'
import { IMPORTANCE_LABEL, THREAD_STATUS_LABEL } from '@/lib/labels'
import { ThreadDetailDialog } from './thread-detail-dialog'
import { ThreadForm } from './thread-form'
import type { ChapterOption, EntryOption, ThreadItem } from './thread-types'

type ThreadBoardProps = {
  workId: string
  role: Role
  threads: ThreadItem[]
  chapters: ChapterOption[]
  entries: EntryOption[]
}
type StatusFilter = 'all' | ThreadStatus
const STATUS_FILTERS = ['all', ...THREAD_STATUSES] as const

function isOverdue(thread: ThreadItem, position: number) {
  return (
    thread.plantedPosition !== null &&
    thread.plantedPosition <= position &&
    (thread.status === 'planted' || thread.status === 'developing') &&
    thread.targetChapterPosition !== null &&
    thread.targetChapterPosition < position
  )
}

function StatusFilters({
  value,
  onChange,
}: {
  value: StatusFilter
  onChange: (status: StatusFilter) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="떡밥 상태">
      {STATUS_FILTERS.map((status) => (
        <button
          key={status}
          type="button"
          className="b-chip b-wiki-choice"
          aria-pressed={value === status}
          onClick={() => onChange(status)}
        >
          {status === 'all' ? '전체' : THREAD_STATUS_LABEL[status]}
        </button>
      ))}
    </div>
  )
}

export function ThreadBoard({ workId, role, threads, chapters, entries }: ThreadBoardProps) {
  const canEdit = role === 'owner' || role === 'editor'
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [pointerId, setPointerId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const labelHeadRef = useRef<HTMLSpanElement>(null)
  const returnFocus = useRef<HTMLButtonElement>(null)
  const rangeId = useId()
  const latest = Math.max(1, ...chapters.map(({ position }) => position))
  const max = threads.reduce(
    (last, thread) =>
      Math.max(last, thread.targetChapterPosition ?? 0, thread.plantedPosition ?? 0),
    latest,
  )
  const [position, setPosition] = useState<number | null>(null)
  const current = Math.min(position ?? latest, max)
  const items = threads.map((thread) => {
    const planted = thread.plantedPosition !== null && thread.plantedPosition <= current
    return { ...thread, planted, overdue: isOverdue(thread, current) }
  })
  const hasNotes = threads.some((thread) => isOverdue(thread, max))
  const selected = items.find((thread) => thread.id === selectedId)
  const highlighted = items.find((thread) => thread.id === (focusId ?? pointerId ?? selectedId))
  const plantedCount = items.filter((thread) => thread.planted).length
  const overdueCount = items.filter((thread) => thread.overdue).length
  const visible = items.filter((thread) => filter === 'all' || thread.status === filter)

  const revealTick = useCallback((next: number, focusTick = false) => {
    const scroll = scrollRef.current
    const tick = scroll?.querySelector<HTMLButtonElement>(`[data-position="${next}"]`)
    if (!scroll || !tick) return
    const view = scroll.getBoundingClientRect()
    const target = tick.getBoundingClientRect()
    const labelWidth = labelHeadRef.current?.offsetWidth ?? 0
    const left = view.left + labelWidth
    if (target.left < left || target.right > view.right) {
      scroll.scrollLeft += (target.left + target.right - left - view.right) / 2
    }
    if (focusTick) tick.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    revealTick(current)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => revealTick(current))
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [current, threads.length, revealTick])

  function changePosition(next: number, focusTick = false) {
    setPosition(next)
    revealTick(next, focusTick)
  }

  function handleTickKey(event: KeyboardEvent<HTMLButtonElement>) {
    const keys: Record<string, number> = {
      ArrowLeft: Math.max(1, current - 1),
      ArrowRight: Math.min(max, current + 1),
      Home: 1,
      End: max,
    }
    if (!Object.hasOwn(keys, event.key)) return
    event.preventDefault()
    changePosition(keys[event.key], true)
  }

  return (
    <>
      <header className="b-wiki-toolbar">
        <div className="min-w-0">
          <h2 id="threads-heading" className="b-wiki-section-title">
            떡밥 장부
          </h2>
          <p className="b-label b-muted">심어 둔 떡밥이 지금 어디쯤 와 있는지 봐요.</p>
        </div>
        <div className="b-wiki-thread-tools">
          <div className="b-wiki-range-field">
            <div className="flex justify-between gap-2 font-bold">
              <label htmlFor={rangeId}>기준 회차</label>
              <output aria-hidden="true" htmlFor={rangeId} className="b-wiki-tag bg-paper">
                {current}화
              </output>
            </div>
            <div
              className="b-wiki-range"
              data-live={dragging}
              style={{ '--b-value': max === 1 ? 0 : (current - 1) / (max - 1) } as CSSProperties}
            >
              <span className="b-meter b-wiki-meter" data-live={dragging} aria-hidden="true">
                <span className="b-meter__fill" />
              </span>
              <span className="b-wiki-range-thumb" aria-hidden="true" />
              <input
                id={rangeId}
                type="range"
                min={1}
                max={max}
                value={current}
                aria-valuetext={`${current}화`}
                disabled={max === 1}
                onChange={(event) => changePosition(Number(event.currentTarget.value))}
                onPointerDown={() => setDragging(true)}
                onPointerUp={() => setDragging(false)}
                onPointerCancel={() => setDragging(false)}
                onLostPointerCapture={() => setDragging(false)}
                onBlur={() => setDragging(false)}
              />
            </div>
          </div>
          {canEdit && (
            <Dialog open={creating} onOpenChange={setCreating}>
              <DialogTrigger render={<PopButton />}>새 떡밥</DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>새 떡밥</DialogTitle>
                  <DialogDescription>
                    심은 떡밥이나 아직 계획만 있는 떡밥을 추가해요.
                  </DialogDescription>
                </DialogHeader>
                <ThreadForm
                  workId={workId}
                  chapters={chapters}
                  entries={entries}
                  onDone={() => setCreating(false)}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      <section aria-label="회차별 떡밥" className="b-wiki-ledger">
        {threads.length === 0 ? (
          <EmptyState
            title="아직 떡밥이 없어요."
            description="심어 둔 떡밥을 여기 적어 두세요. 회수 목표를 넘긴 떡밥은 작품 홈에 따로 표시돼요."
          />
        ) : (
          <>
            <div className="b-wiki-ledger-dock">
              <div className="b-wiki-ledger-counts" aria-live="polite" aria-atomic="true">
                <strong className="b-wiki-tag bg-paper">{current}화 기준</strong>
                <span>
                  심음 <strong>{plantedCount}</strong>
                </span>
                <span>
                  계획 <strong>{items.length - plantedCount}</strong>
                </span>
                <span>
                  지남 <strong>{overdueCount}</strong>
                </span>
              </div>
              <div className="b-wiki-search-inline">
                <StatusFilters value={filter} onChange={setFilter} />
              </div>
              <div className="b-wiki-search-sheet">
                <MenuSheet
                  title="떡밥 상태"
                  label="떡밥 상태 필터"
                  triggerText="상태 필터"
                  triggerClassName="max-w-full"
                >
                  <StatusFilters value={filter} onChange={setFilter} />
                </MenuSheet>
              </div>
            </div>
            <div
              className="b-wiki-ledger-scroll b-table-scroll"
              role="region"
              aria-label="떡밥 회차 축"
              tabIndex={0}
              ref={scrollRef}
            >
              <div
                className="b-wiki-timeline"
                data-has-notes={hasNotes}
                style={{ '--b-wiki-max': max } as CSSProperties}
              >
                <div className="b-wiki-timeline-head">
                  <span className="b-wiki-timeline-title" ref={labelHeadRef}>
                    떡밥
                  </span>
                  <div className="b-wiki-ticks" role="group" aria-label="기준 회차">
                    {Array.from({ length: max }, (_, index) => {
                      const number = index + 1
                      return (
                        <span
                          className="b-wiki-tick"
                          key={number}
                          data-current={number === current}
                          data-related={
                            number === highlighted?.plantedPosition ||
                            number === highlighted?.targetChapterPosition
                          }
                        >
                          <button
                            type="button"
                            className="b-number"
                            aria-pressed={number === current}
                            tabIndex={number === current ? 0 : -1}
                            data-position={number}
                            onClick={() => changePosition(number)}
                            onKeyDown={handleTickKey}
                          >
                            {number}화
                          </button>
                        </span>
                      )
                    })}
                  </div>
                </div>

                <div className="b-wiki-timeline-body">
                  <span
                    className="b-wiki-current-guide"
                    data-live={dragging}
                    style={{ '--b-wiki-episode': current - 1 } as CSSProperties}
                    aria-hidden="true"
                  />
                  {visible.map((thread, index) => (
                    <TimelineRow
                      key={thread.id}
                      thread={thread}
                      index={index}
                      current={current}
                      selected={thread.id === selectedId}
                      onHover={(active) => setPointerId(active ? thread.id : null)}
                      onFocus={(active) => setFocusId(active ? thread.id : null)}
                      onOpen={(button) => {
                        returnFocus.current = button
                        setSelectedId(thread.id)
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            {visible.length === 0 && (
              <p role="status" className="b-label">
                떡밥이 없어요.
              </p>
            )}
            <ul aria-label="범례" className="b-wiki-legend b-label">
              <li>
                <span className="b-wiki-seed" aria-hidden="true" />
                심은 화
              </li>
              <li>
                <span className="b-wiki-diamond" aria-hidden="true" />
                회수 목표
              </li>
              <li>
                <span className="b-wiki-dashes" aria-hidden="true" />
                계획
              </li>
            </ul>
          </>
        )}
      </section>
      {selected && (
        <ThreadDetailDialog
          key={selected.id}
          workId={workId}
          thread={selected}
          chapters={chapters}
          entries={entries}
          canEdit={canEdit}
          open
          finalFocus={returnFocus}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null)
          }}
        />
      )}
    </>
  )
}

function TimelineRow({
  thread,
  index,
  current,
  selected,
  onHover,
  onFocus,
  onOpen,
}: {
  thread: ThreadItem & { planted: boolean }
  index: number
  current: number
  selected: boolean
  onHover: (active: boolean) => void
  onFocus: (active: boolean) => void
  onOpen: (button: HTMLButtonElement) => void
}) {
  const plant = thread.plantedPosition
  const target = thread.targetChapterPosition
  const start = plant ?? 1
  const end = target ?? (thread.planted ? start : Math.max(start, current))
  const plotStyle = {
    '--b-i': Math.min(index, 5),
    '--b-wiki-plant': (plant ?? start) - 1,
    '--b-wiki-target': (target ?? end) - 1,
    '--b-wiki-start': Math.min(start, end) - 1,
    '--b-wiki-span': Math.abs(end - start),
  } as CSSProperties

  return (
    <button
      type="button"
      className="b-row b-wiki-timeline-row"
      data-status={thread.status}
      aria-haspopup="dialog"
      aria-expanded={selected}
      style={plotStyle}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onFocus(true)}
      onBlur={() => onFocus(false)}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span className="b-wiki-timeline-label">
        <span className="flex items-start justify-between gap-2">
          <span className="b-row__title wrap-anywhere">{thread.title}</span>
          <ChevronDownIcon className="b-icon b-chevron shrink-0" aria-hidden="true" />
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="b-wiki-tag" data-status={thread.status}>
            {THREAD_STATUS_LABEL[thread.status]}
          </span>
          <span>중요도 {IMPORTANCE_LABEL[thread.importance]}</span>
        </span>
        {plant !== null && <span className="b-label">심은 회차 {plant}화</span>}
        {target !== null && <span className="b-label">목표 {target}화</span>}
        {thread.relatedEntries.length > 0 && (
          <span className="text-xs text-muted-ink wrap-anywhere">
            {thread.relatedEntries.map(({ name }) => name).join(' · ')}
          </span>
        )}
        {thread.overdue && <span className="b-wiki-overdue">회수 목표 지남</span>}
        <span className="b-row-rule" aria-hidden="true" />
      </span>
      <span
        className="b-wiki-plot"
        data-planted={thread.planted}
        data-coincident={plant !== null && plant === target}
        aria-hidden="true"
      >
        {start !== end && (
          <span className="b-wiki-plot-line">
            <span className="b-wiki-plot-trace" />
            <span className="b-wiki-plot-join" />
          </span>
        )}
        {plant !== null && (
          <span className="b-wiki-mark b-wiki-mark-plant" data-visible={thread.planted}>
            <span className="b-wiki-seed" />
          </span>
        )}
        {target !== null && (
          <span className="b-wiki-mark b-wiki-mark-target">
            <span className="b-wiki-diamond" data-resolved={thread.status === 'resolved'} />
          </span>
        )}
      </span>
      {thread.overdue && (
        <span className="b-wiki-note-cell" aria-hidden="true">
          <HandNote className="b-wiki-thread-note">거둘 때가 지났어요</HandNote>
        </span>
      )}
    </button>
  )
}
