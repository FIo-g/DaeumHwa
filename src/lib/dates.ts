// Day boundaries and displayed dates use Asia/Seoul (UTC+9, no DST).
// Pure arithmetic only: no Intl and no process timezone dependency.

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

/** Today's date in Seoul as `YYYY-MM-DD`. */
export function seoulToday(now: Date = new Date()): string {
  return new Date(now.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10)
}

/** The instant of Seoul midnight that starts the Seoul day containing `now`. */
export function seoulDayStart(now: Date = new Date()): Date {
  return new Date(`${seoulToday(now)}T00:00:00+09:00`)
}

/** Adds whole days to a `YYYY-MM-DD` date string. */
export function addDays(date: string, n: number): string {
  return new Date(parseDateUtc(date) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Weekday of a `YYYY-MM-DD` date, 0 = Sunday. */
export function dayOfWeek(date: string): number {
  return new Date(parseDateUtc(date)).getUTCDay()
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateUtc(to) - parseDateUtc(from)) / DAY_MS)
}

/** Normalizes a Date or date string to an ISO string, or null when empty or invalid. */
export function toIsoString(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** `2026. 10. 16. 14:05` in Seoul time. */
export function formatKoreanDateTime(v: Date | string): string {
  const d = new Date((v instanceof Date ? v.getTime() : new Date(v).getTime()) + SEOUL_OFFSET_MS)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}. ${hh}:${mm}`
}

/** `10월 16일 (금)` for a `YYYY-MM-DD` date. */
export function formatKoreanDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}월 ${Number(day)}일 (${WEEKDAYS_KO[dayOfWeek(date)]})`
}

function parseDateUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
