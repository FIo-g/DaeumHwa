import { addDays, dayOfWeek, daysBetween } from '@/lib/dates'
import type { ScheduleInput } from '@/db/types'
import { chapterLabel } from '@/lib/labels'

export type ScheduleSlot = {
  date: string
  chapterId: string | null
  chapterTitle: string | null
  position: number | null
}

export type ScheduleResult = {
  bufferCount: number
  slots: ScheduleSlot[]
  bufferRunsOutOn: string | null
  nextDeadline: { id: string; title: string; date: string; daysLeft: number } | null
  warnings: string[]
  hiatusDays: string[]
}

const DEADLINE_WARNING_DAYS = 3

/**
 * Plans the publish calendar from today: finished chapters not yet published form the buffer,
 * which fills publish days in order. Hiatus periods skip publish days.
 */
export function computeSchedule(
  input: ScheduleInput,
  today: string,
  horizonDays = 42,
): ScheduleResult {
  const { settings } = input
  const horizonEnd = addDays(today, horizonDays - 1)

  const buffer = input.chapters
    .filter((c) => c.status === 'done' && (c.publishedOn === null || c.publishedOn > today))
    .sort((a, b) => a.position - b.position)

  const openItems = input.items.filter((item) => !item.done)
  const hiatusDates = new Set<string>()
  for (const item of openItems) {
    if (item.kind !== 'hiatus') continue
    const last = item.endDate ?? item.date
    for (let d = item.date; d <= last && d <= horizonEnd; d = addDays(d, 1)) {
      if (d >= today) hiatusDates.add(d)
    }
  }

  const queue = [...buffer]
  const slots: ScheduleSlot[] = []
  for (let offset = 0; offset < horizonDays; offset++) {
    const date = addDays(today, offset)
    if (!settings.publishDays.includes(dayOfWeek(date)) || hiatusDates.has(date)) continue
    for (let k = 0; k < settings.chaptersPerPublishDay; k++) {
      const next = queue.shift()
      slots.push(
        next
          ? {
              date,
              chapterId: next.id,
              chapterTitle: chapterLabel(next.position, next.title),
              position: next.position,
            }
          : { date, chapterId: null, chapterTitle: null, position: null },
      )
    }
  }

  const bufferRunsOut = slots.find((s) => s.chapterId === null)
  const deadlines = openItems.filter((item) => item.kind === 'deadline')

  const warnings: string[] = []
  if (buffer.length < settings.bufferTarget) {
    warnings.push(
      `비축분이 목표(${settings.bufferTarget}화)보다 적습니다 (현재 ${buffer.length}화).`,
    )
  }
  for (const item of deadlines) {
    const days = daysBetween(today, item.date)
    if (days < 0) warnings.push(`지난 마감이 있습니다: ${item.title}`)
    else if (days <= DEADLINE_WARNING_DAYS)
      warnings.push(`마감이 ${days}일 남았습니다: ${item.title}`)
  }

  const upcoming = deadlines
    .filter((item) => item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  return {
    bufferCount: buffer.length,
    slots,
    bufferRunsOutOn: bufferRunsOut?.date ?? null,
    nextDeadline: upcoming
      ? {
          id: upcoming.id,
          title: upcoming.title,
          date: upcoming.date,
          daysLeft: daysBetween(today, upcoming.date),
        }
      : null,
    warnings,
    hiatusDays: [...hiatusDates].sort(),
  }
}
