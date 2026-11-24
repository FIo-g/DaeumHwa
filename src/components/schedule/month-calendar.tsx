'use client'

import { type CSSProperties, type KeyboardEvent, useId, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Sheet } from '@/components/motion'
import { Button } from '@/components/ui/button'
import type { ScheduleKind } from '@/db/types'
import { addDays, dayOfWeek, formatKoreanDate } from '@/lib/dates'
import { SCHEDULE_KIND_LABEL } from '@/lib/labels'
import type { ScheduleSlot } from '@/lib/schedule'
import { cn } from '@/lib/utils'

export type CalendarItem = {
  id: string
  kind: ScheduleKind
  title: string
  date: string
  endDate: string | null
  done: boolean
}

type MonthCalendarProps = {
  /** The month shown, as `YYYY-MM`. */
  month: string
  /** Today in Seoul as `YYYY-MM-DD`. */
  today: string
  /** Publish slots from the schedule calculation. */
  slots: ScheduleSlot[]
  /** Schedule items. Open hiatus items mark every day in their range. */
  items: CalendarItem[]
  publishDays?: readonly number[]
  onMonthChange: (month: string) => void
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const ARROW_OFFSETS = new Map([
  ['ArrowLeft', -1],
  ['ArrowRight', 1],
  ['ArrowUp', -7],
  ['ArrowDown', 7],
])

/** Shifts a `YYYY-MM` month by a number of months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number)
  const index = year * 12 + (mon - 1) + delta
  const y = Math.floor(index / 12)
  const m = (index % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * Dates of the grid for a month: whole weeks from the Sunday on or before the 1st to the
 * Saturday on or after the last day.
 */
export function monthGridDates(month: string): string[] {
  const first = `${month}-01`
  const [year, mon] = month.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const leading = dayOfWeek(first)
  const weeks = Math.ceil((leading + daysInMonth) / 7)
  const start = addDays(first, -leading)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
}

/** Hand-built month grid (Sunday first). Shows publish slots, hiatus days, and schedule items. */
export function MonthCalendar({
  month,
  today,
  slots,
  items,
  publishDays,
  onMonthChange,
}: MonthCalendarProps) {
  const grid = useRef<HTMLDivElement>(null)
  const detailsId = useId()
  const [opening, setOpening] = useState(true)
  const [focusedDay, setFocusedDay] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  function turn(delta: -1 | 1) {
    setOpening(false)
    setFocusedDay(null)
    setSelectedDay(null)
    onMonthChange(shiftMonth(month, delta))
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offset = ARROW_OFFSETS.get(event.key)
    if (offset === undefined) return
    event.preventDefault()
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${addDays(date, offset)}"] > button`)
      ?.focus()
  }

  const dates = monthGridDates(month)
  const first = dates[0]
  const last = dates[dates.length - 1]
  const [year, mon] = month.split('-').map(Number)
  const monthLabel = `${year}년 ${mon}월`
  const tabStop =
    focusedDay && dates.includes(focusedDay)
      ? focusedDay
      : dates.includes(today)
        ? today
        : `${month}-01`

  const slotsByDate = new Map<string, ScheduleSlot[]>()
  for (const slot of slots) {
    if (slot.date < first || slot.date > last) continue
    const list = slotsByDate.get(slot.date) ?? []
    list.push(slot)
    slotsByDate.set(slot.date, list)
  }

  const hiatusDates = new Set<string>()
  const itemsByDate = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const end = item.endDate ?? item.date
    if (end < first || item.date > last) continue
    for (let d = item.date; d <= end; d = addDays(d, 1)) {
      if (d < first || d > last) continue
      // Done hiatus items no longer hold publish days (see computeSchedule), so they show as items.
      if (item.kind === 'hiatus' && !item.done) {
        hiatusDates.add(d)
        continue
      }
      const list = itemsByDate.get(d) ?? []
      list.push(item)
      itemsByDate.set(d, list)
    }
  }

  const publishOrder = new Map<string, number>()
  for (const date of dates) {
    if (
      slotsByDate.has(date) ||
      (date >= today && publishDays?.includes(dayOfWeek(date)) && !hiatusDates.has(date))
    ) {
      publishOrder.set(date, publishOrder.size)
    }
  }

  const selectedSlots = selectedDay ? (slotsByDate.get(selectedDay) ?? []) : []
  const selectedItems = selectedDay ? (itemsByDate.get(selectedDay) ?? []) : []
  const selectedHiatus = selectedDay ? hiatusDates.has(selectedDay) : false

  return (
    <Sheet as="div" label={monthLabel} page={month.slice(5)} className="wg-schedule-month">
      <div className="wg-schedule-month-controls">
        <h2 className="sr-only" aria-live="polite">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="이전 달" onClick={() => turn(-1)}>
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" aria-label="다음 달" onClick={() => turn(1)}>
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div
        className="wg-schedule-calendar-region"
        role="region"
        aria-label="달력 가로로 보기"
        tabIndex={0}
      >
        <div
          ref={grid}
          key={month}
          role="grid"
          data-opening={opening}
          aria-label={`${monthLabel} 연재 달력`}
          className="wg-schedule-grid"
        >
          <div role="row" className="wg-schedule-week wg-schedule-weekdays">
            {WEEKDAY_LABELS.map((label) => (
              <div role="columnheader" key={label}>
                {label}
              </div>
            ))}
          </div>
          {Array.from({ length: dates.length / 7 }, (_, week) => (
            <div
              role="row"
              key={dates[week * 7]}
              className="wg-schedule-week"
              style={{ '--wg-schedule-week-index': week + 1 } as CSSProperties}
            >
              {dates.slice(week * 7, week * 7 + 7).map((date) => {
                const inMonth = date.startsWith(month)
                const isToday = date === today
                const daySlots = slotsByDate.get(date) ?? []
                const dayItems = itemsByDate.get(date) ?? []
                const isHiatus = hiatusDates.has(date)
                const isRest =
                  inMonth &&
                  publishDays &&
                  !publishDays.includes(dayOfWeek(date)) &&
                  !daySlots.length
                const slot = daySlots[0]
                const item = dayItems[0]
                const order = publishOrder.get(date)
                const extra = Math.max(0, daySlots.length - 1) + Math.max(0, dayItems.length - 1)
                return (
                  <div
                    role="gridcell"
                    key={date}
                    data-date={date}
                    data-muted={date < today || !inMonth}
                    aria-current={isToday ? 'date' : undefined}
                    className="wg-schedule-day"
                  >
                    <button
                      type="button"
                      className="wg-schedule-day-button"
                      tabIndex={date === tabStop ? 0 : -1}
                      aria-expanded={selectedDay === date}
                      aria-controls={detailsId}
                      onFocus={() => setFocusedDay(date)}
                      onKeyDown={(event) => moveFocus(event, date)}
                      onClick={() => setSelectedDay((current) => (current === date ? null : date))}
                    >
                      <span className="sr-only">{formatKoreanDate(date)}</span>
                      <span className="wg-schedule-day-number" aria-hidden="true">
                        {Number(date.slice(8))}
                      </span>
                      <span
                        className="wg-schedule-day-entries"
                        data-publish-day={order !== undefined}
                        style={
                          order !== undefined
                            ? ({ '--wg-schedule-publish-index': order } as CSSProperties)
                            : undefined
                        }
                      >
                        {(isHiatus || isRest) && (
                          <span
                            className="wg-schedule-day-entry"
                            aria-hidden={isHiatus ? undefined : true}
                          >
                            <span
                              className="wg-schedule-day-mark"
                              data-mark="slash"
                              aria-hidden="true"
                            />
                            {isHiatus && <span className="wg-schedule-day-word">휴재</span>}
                          </span>
                        )}
                        {slot && (
                          <span
                            className="wg-schedule-day-entry"
                            title={slot.chapterTitle || '빈 연재일'}
                          >
                            <span
                              className="wg-schedule-day-mark"
                              data-mark={slot.chapterTitle ? 'square' : 'ring'}
                              aria-hidden="true"
                            />
                            {slot.position === null ? (
                              <span className="wg-schedule-day-word">빈 연재일</span>
                            ) : (
                              <>
                                <span className="sr-only">{slot.chapterTitle}</span>
                                <span className="wg-schedule-chapter-number" aria-hidden="true">
                                  {slot.position}화
                                </span>
                              </>
                            )}
                          </span>
                        )}
                        {item && (
                          <span
                            className="wg-schedule-day-entry"
                            data-item
                            title={SCHEDULE_KIND_LABEL[item.kind]}
                          >
                            <span
                              className="wg-schedule-day-mark"
                              data-mark="dot"
                              aria-hidden="true"
                            />
                            <span
                              className={cn('wg-schedule-day-word', item.done && 'line-through')}
                            >
                              {item.title}
                            </span>
                          </span>
                        )}
                      </span>
                      {extra > 0 && <span className="wg-schedule-day-extra">+{extra}</span>}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div id={detailsId} aria-live="polite">
        {selectedDay && (
          <div className="wg-schedule-day-details" key={selectedDay}>
            <time className="font-mono" dateTime={selectedDay}>
              {formatKoreanDate(selectedDay)}
            </time>
            {selectedHiatus && <p>휴재</p>}
            {selectedSlots.length > 0 && (
              <ul>
                {selectedSlots.map((slot, index) => (
                  <li key={index}>{slot.chapterTitle || '빈 연재일'}</li>
                ))}
              </ul>
            )}
            {selectedItems.length > 0 && (
              <ul>
                {selectedItems.map((item) => (
                  <li key={item.id} className={item.done ? 'line-through' : undefined}>
                    {item.title}
                  </li>
                ))}
              </ul>
            )}
            {!selectedHiatus && selectedSlots.length === 0 && selectedItems.length === 0 && (
              <p>아직 등록한 일정이 없어요.</p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
