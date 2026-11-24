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
import { CountCell, MenuSheet, Reveal, Sheet } from '@/components/motion'
import { Button } from '@/components/ui/button'
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
import { threadChapterCenter } from './thread-geometry'
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
const MARKER_WIDTH_REM = { seed: 0.5, target: 0.9375 }
const markerStyle = {
  '--wg-threads-seed-size': `${MARKER_WIDTH_REM.seed}rem`,
  '--wg-threads-target-size': `${MARKER_WIDTH_REM.target}rem`,
} as CSSProperties

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
    <div className="wg-threads-filters" role="group" aria-label="떡밥 상태">
      {STATUS_FILTERS.map((status) => (
        <button
          key={status}
          type="button"
          className="wg-threads-filter"
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
  const [sceneFinished, setSceneFinished] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const axisRef = useRef<HTMLDivElement>(null)
  const labelHeadRef = useRef<HTMLSpanElement>(null)
  const returnFocus = useRef<HTMLButtonElement>(null)
  const countsRef = useRef<HTMLDivElement>(null)
  const previousCounts = useRef<number[]>([])
  const rangeId = useId()
  const writtenChapters = new Set(chapters.map(({ position }) => position))
  const latest = Math.max(1, ...writtenChapters)
  const max = threads.reduce(
    (last, thread) =>
      Math.max(last, thread.targetChapterPosition ?? 0, thread.plantedPosition ?? 0),
    latest,
  )
  const [position, setPosition] = useState<number | null>(null)
  const current = Math.min(position ?? latest, max)
  const items = threads.map((thread) => ({
    ...thread,
    planted: thread.plantedPosition !== null && thread.plantedPosition <= current,
    overdue: isOverdue(thread, current),
  }))
  const selected = items.find((thread) => thread.id === selectedId)
  const visible = items.filter((thread) => filter === 'all' || thread.status === filter)
  const highlighted = visible.find((thread) => thread.id === (focusId ?? pointerId ?? selectedId))
  const [highlightStart, highlightEnd] = highlighted ? trackEndpoints(highlighted, current) : []
  const plantedCount = items.filter((thread) => thread.planted).length
  const overdueCount = items.filter((thread) => thread.overdue).length
  const plannedCount = items.length - plantedCount

  useLayoutEffect(() => {
    const before = previousCounts.current
    const values = [current, plantedCount, plannedCount, overdueCount]
    previousCounts.current = values
    const cells = countsRef.current?.querySelectorAll<HTMLElement>('.wg-threads-count')
    if (
      !cells?.[0]?.animate ||
      before.length === 0 ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return

    const style = getComputedStyle(cells[0])
    const duration = Number.parseFloat(style.getPropertyValue('--b-quick'))
    const easing = style.getPropertyValue('--b-out')
    const animations = Array.from(cells).flatMap((cell, index) =>
      values[index] === before[index]
        ? []
        : [
            cell.animate([{ transform: 'translateY(.25em)' }, { transform: 'translateY(0)' }], {
              duration,
              easing,
            }),
          ],
    )
    return () => animations.forEach((animation) => animation.cancel())
  }, [current, plantedCount, plannedCount, overdueCount])

  const revealTick = useCallback((next: number, focusTick = false) => {
    const scroll = scrollRef.current
    const tick = axisRef.current?.querySelector<HTMLButtonElement>(`[data-position="${next}"]`)
    if (!scroll || !tick) return
    const view = scroll.getBoundingClientRect()
    const target = tick.getBoundingClientRect()
    const labelWidth = labelHeadRef.current?.getBoundingClientRect().width ?? 0
    const left = view.left + labelWidth
    if (target.left < left || target.right > view.right) {
      const distance = (target.left + target.right - left - view.right) / 2
      scroll.scrollLeft += distance / (scroll.currentCSSZoom || 1)
    }
    if (focusTick) tick.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    const label = labelHeadRef.current
    if (!scroll || !label) return
    revealTick(current)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => revealTick(current))
    observer.observe(scroll)
    observer.observe(label)
    return () => observer.disconnect()
  }, [current, max, threads.length, revealTick])

  function changePosition(next: number, focusTick = false) {
    setPosition(next)
    revealTick(next, focusTick)
  }

  function handleTickKey(event: KeyboardEvent<HTMLButtonElement>) {
    const number = Number(event.currentTarget.dataset.position)
    const keys: Record<string, number> = {
      ArrowLeft: Math.max(1, number - 1),
      ArrowRight: Math.min(max, number + 1),
      Home: 1,
      End: max,
    }
    if (!Object.hasOwn(keys, event.key)) return
    event.preventDefault()
    changePosition(keys[event.key], true)
  }

  return (
    <>
      <header className="wg-threads-toolbar">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="threads-heading" className="b-subhead">
            떡밥 장부
          </h2>
          <p className="b-label b-muted">심어 둔 떡밥이 지금 어디쯤 와 있는지 봐요.</p>
        </div>
        <div className="wg-threads-tools">
          <div className="wg-threads-range-field">
            <div className="flex justify-between gap-2 text-sm">
              <label htmlFor={rangeId} className="font-medium">
                기준 회차
              </label>
              <output aria-hidden="true" htmlFor={rangeId} className="font-mono">
                {current}화
              </output>
            </div>
            <div className="wg-threads-range">
              <TrackRules chapters={Math.min(max, 40)} className="wg-threads-range-rules" />
              <input
                id={rangeId}
                type="range"
                min={1}
                max={max}
                value={current}
                aria-valuetext={`${current}화`}
                disabled={max === 1}
                onChange={(event) => changePosition(Number(event.currentTarget.value))}
              />
            </div>
          </div>
          {canEdit && (
            <Dialog open={creating} onOpenChange={setCreating}>
              <DialogTrigger render={<Button />}>새 떡밥</DialogTrigger>
              <DialogContent className="sm:max-w-lg">
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

      <Sheet aria-label="회차별 떡밥" className="wg-threads-ledger">
        {threads.length === 0 ? (
          <EmptyState
            title="아직 떡밥이 없어요."
            description="심어 둔 떡밥을 여기 적어 두세요. 회수 목표를 넘긴 떡밥은 작품 홈에 따로 표시돼요."
          />
        ) : (
          <>
            <div className="wg-threads-dock">
              <div
                className="wg-threads-counts"
                aria-live="polite"
                aria-atomic="true"
                ref={countsRef}
              >
                <strong>
                  <CountCell value={current} unit="화" className="wg-threads-count" /> 기준
                </strong>
                <span>
                  심음 <CountCell value={plantedCount} className="wg-threads-count" />
                </span>
                <span>
                  계획 <CountCell value={plannedCount} className="wg-threads-count" />
                </span>
                <span>
                  지남 <CountCell value={overdueCount} className="wg-threads-count" />
                </span>
              </div>
              <div className="wg-threads-filters-inline">
                <StatusFilters value={filter} onChange={setFilter} />
              </div>
              <div className="wg-threads-filters-sheet">
                <MenuSheet
                  title="떡밥 상태"
                  label="떡밥 상태 필터"
                  triggerText="상태 필터"
                  className="bottom-auto max-h-dvh"
                  triggerClassName="max-w-full"
                >
                  <StatusFilters value={filter} onChange={setFilter} />
                </MenuSheet>
              </div>
            </div>
            <div
              className="wg-threads-scroll"
              role="region"
              aria-label="떡밥 회차 축"
              tabIndex={0}
              ref={scrollRef}
            >
              <Reveal
                effectOnly
                className="wg-threads-timeline"
                data-scene-finished={sceneFinished}
                style={
                  {
                    '--wg-threads-chapters': max,
                    '--wg-threads-tick-digits': String(max).length,
                    '--wg-threads-current': current - 1,
                    ...markerStyle,
                  } as CSSProperties
                }
              >
                <div className="wg-threads-ledger-rules" aria-hidden="true">
                  {Array.from({ length: max }, (_, index) => (
                    <span
                      key={index}
                      data-highlight-start={index + 1 === current || index === current}
                      data-highlight-end={index + 1 === max && current === max}
                    />
                  ))}
                </div>
                <div className="wg-threads-axis">
                  <span className="wg-threads-axis-label" ref={labelHeadRef}>
                    떡밥
                  </span>
                  <div
                    className="wg-threads-ticks"
                    ref={axisRef}
                    role="group"
                    aria-label="기준 회차"
                  >
                    {Array.from({ length: max }, (_, index) => {
                      const number = index + 1
                      return (
                        <button
                          key={number}
                          type="button"
                          className="wg-threads-tick"
                          aria-pressed={number === current}
                          tabIndex={number === current ? 0 : -1}
                          data-position={number}
                          data-related={number === highlightStart || number === highlightEnd}
                          data-future={!writtenChapters.has(number)}
                          onClick={() => changePosition(number)}
                          onKeyDown={handleTickKey}
                        >
                          <span className="font-mono">{number}</span>화
                        </button>
                      )
                    })}
                    <span className="wg-threads-axis-guide" aria-hidden="true">
                      <span>지금</span>
                    </span>
                    <span
                      className="wg-threads-axis-rule"
                      aria-hidden="true"
                      onAnimationEnd={(event) => {
                        if (event.animationName === 'wg-threads-scene') setSceneFinished(true)
                      }}
                    />
                  </div>
                </div>

                {visible.map((thread, index) => (
                  <TimelineRow
                    key={thread.id}
                    thread={thread}
                    index={index}
                    chapters={max}
                    current={current}
                    active={thread.id === highlighted?.id}
                    selected={thread.id === selectedId}
                    onHover={(active) => setPointerId(active ? thread.id : null)}
                    onFocus={(active) => setFocusId(active ? thread.id : null)}
                    onOpen={(button) => {
                      returnFocus.current = button
                      setSelectedId(thread.id)
                    }}
                  />
                ))}
              </Reveal>
            </div>
            {visible.length === 0 && (
              <p role="status" className="b-label">
                떡밥이 없어요.
              </p>
            )}
            <ul aria-label="범례" className="wg-threads-legend b-label" style={markerStyle}>
              <li>
                <span className="wg-threads-seed" aria-hidden="true" />
                심은 화
              </li>
              <li>
                <span className="wg-threads-target" aria-hidden="true" />
                회수 목표
              </li>
              <li>
                <span className="wg-threads-dashes" aria-hidden="true" />
                계획
              </li>
            </ul>
          </>
        )}
      </Sheet>
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

function trackEndpoints(thread: ThreadItem, current: number) {
  const resolution = thread.events.find((event) => event.kind === 'resolved')?.chapterPosition
  const goal = thread.targetChapterPosition ?? resolution ?? null
  const start = thread.plantedPosition ?? (goal !== null && current < goal ? current : 1)
  const end = goal ?? (thread.plantedPosition === null ? current : start)
  return [start, end, goal] as const
}

function TrackRules({ chapters, className }: { chapters: number; className: string }) {
  const id = useId()
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id={id} width={`${100 / chapters}%`} height="100%">
          <line x1=".5" x2=".5" y2="100%" stroke="var(--b-grid)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}

function TimelineRow({
  thread,
  index,
  chapters,
  current,
  active,
  selected,
  onHover,
  onFocus,
  onOpen,
}: {
  thread: ThreadItem & { planted: boolean }
  index: number
  chapters: number
  current: number
  active: boolean
  selected: boolean
  onHover: (active: boolean) => void
  onFocus: (active: boolean) => void
  onOpen: (button: HTMLButtonElement) => void
}) {
  const plant = thread.plantedPosition
  const [start, end, goal] = trackEndpoints(thread, current)
  const developments = new Set(
    thread.events.flatMap((event) =>
      event.kind === 'developed' && event.chapterPosition !== null ? [event.chapterPosition] : [],
    ),
  )
  const lo = Math.min(start, end, ...developments)
  const hi = Math.max(start, end, ...developments)
  const chapterOffset = (chapter: number) => `${threadChapterCenter(chapter, chapters, 100)}%`
  const coincident = thread.planted && plant === goal
  const singlePlannedCell = hi === lo && !thread.planted && goal !== null

  return (
    <button
      type="button"
      className="wg-threads-row"
      data-active={active}
      aria-haspopup="dialog"
      aria-expanded={selected}
      style={{ '--wg-threads-order': Math.min(index, 2) } as CSSProperties}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') onHover(true)
      }}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onFocus(true)}
      onBlur={() => onFocus(false)}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span className="wg-threads-row-label">
        <span className="wg-threads-row-number font-mono" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="font-heading text-base font-bold wrap-anywhere">{thread.title}</span>
        <ChevronDownIcon
          className="wg-threads-row-arrow size-4"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="wg-threads-row-meta">
          <span className="wg-threads-state">{THREAD_STATUS_LABEL[thread.status]}</span>
          <span>중요도 {IMPORTANCE_LABEL[thread.importance]}</span>
        </span>
        <span className="wg-threads-row-meta">
          {plant !== null && <span className="font-mono">심은 회차 {plant}화</span>}
          {thread.targetChapterPosition !== null && (
            <span className="font-mono">목표 {thread.targetChapterPosition}화</span>
          )}
        </span>
        {thread.relatedEntries.length > 0 && (
          <span className="b-label b-muted wrap-anywhere">
            {thread.relatedEntries.map(({ name }) => name).join(' · ')}
          </span>
        )}
        {thread.overdue && (
          <>
            <span className="wg-threads-overdue">회수 목표 지남</span>
            <span className="wg-threads-note" aria-hidden="true">
              거둘 때가 지났어요
            </span>
          </>
        )}
      </span>
      <span
        className="wg-threads-plot"
        data-planted={thread.planted}
        data-backward={end < start}
        aria-hidden="true"
      >
        {(hi !== lo || singlePlannedCell) && (
          <span
            className="wg-threads-line"
            style={{
              insetInlineStart: singlePlannedCell
                ? `calc(${chapterOffset(lo)} - var(--wg-threads-target-size))`
                : chapterOffset(lo),
              insetInlineEnd: `calc(100% - ${chapterOffset(hi)})`,
            }}
          />
        )}
        {Array.from(developments, (chapter) => (
          <span
            className="wg-threads-development"
            key={chapter}
            style={{ insetInlineStart: chapterOffset(chapter) }}
          />
        ))}
        {thread.planted && plant !== null && (
          <span
            className="wg-threads-seed"
            data-thread-coincident={coincident ? 'seed' : undefined}
            style={{ insetInlineStart: chapterOffset(plant) }}
          />
        )}
        {goal !== null && (
          <span
            className="wg-threads-target"
            data-resolved={thread.status === 'resolved'}
            data-thread-coincident={coincident ? 'target' : undefined}
            style={{ insetInlineStart: chapterOffset(goal) }}
          />
        )}
      </span>
    </button>
  )
}
