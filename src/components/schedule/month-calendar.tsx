'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ScheduleKind } from '@/db/types'
import { addDays, dayOfWeek } from '@/lib/dates'
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
  onMonthChange: (month: string) => void
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

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
export function MonthCalendar({ month, today, slots, items, onMonthChange }: MonthCalendarProps) {
  const dates = monthGridDates(month)
  const first = dates[0]
  const last = dates[dates.length - 1]
  const [year, mon] = month.split('-').map(Number)

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{`${year}년 ${mon}월`}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="이전 달"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="다음 달"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div role="grid" aria-label={`${year}년 ${mon}월 연재 달력`} className="flex flex-col">
        <div
          role="row"
          className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground"
        >
          {WEEKDAY_LABELS.map((label) => (
            <div role="columnheader" key={label} className="py-1.5">
              {label}
            </div>
          ))}
        </div>
        {Array.from({ length: dates.length / 7 }, (_, week) => (
          <div role="row" key={dates[week * 7]} className="grid grid-cols-7">
            {dates.slice(week * 7, week * 7 + 7).map((date) => {
              const inMonth = date.startsWith(month)
              const isToday = date === today
              const daySlots = slotsByDate.get(date) ?? []
              const dayItems = itemsByDate.get(date) ?? []
              const isHiatus = hiatusDates.has(date)
              return (
                <div
                  role="gridcell"
                  key={date}
                  data-date={date}
                  aria-current={isToday ? 'date' : undefined}
                  className={cn(
                    'flex min-h-20 min-w-0 flex-col gap-0.5 border-b border-r p-1 text-xs',
                    !inMonth && 'bg-muted/40 text-muted-foreground',
                    isToday && 'outline outline-2 -outline-offset-2 outline-primary',
                  )}
                >
                  <span className={cn('font-medium', isToday && 'text-primary')}>
                    {Number(date.slice(8))}
                  </span>
                  {isHiatus && (
                    <span className="truncate rounded bg-amber-100 px-1 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      휴재
                    </span>
                  )}
                  {daySlots.map((slot, index) =>
                    slot.chapterTitle ? (
                      <span key={`slot-${index}`} className="truncate">
                        {slot.chapterTitle}
                      </span>
                    ) : (
                      <span
                        key={`slot-${index}`}
                        className="truncate text-red-600 dark:text-red-400"
                      >
                        빈 연재일
                      </span>
                    ),
                  )}
                  {dayItems.map((item) => (
                    <span
                      key={`${item.id}-${date}`}
                      title={SCHEDULE_KIND_LABEL[item.kind]}
                      className={cn('truncate text-muted-foreground', item.done && 'line-through')}
                    >
                      {item.title}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
