import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  dayOfWeek,
  formatKoreanDate,
  formatKoreanDateTime,
  isPlausibleIsoDate,
  seoulDayStart,
  seoulToday,
  toIsoString,
} from '@/lib/dates'

describe('seoulToday and seoulDayStart (Asia/Seoul day boundary)', () => {
  it('uses the Seoul date, not the UTC date', () => {
    expect(seoulToday(new Date('2026-10-16T15:30:00Z'))).toBe('2026-10-17')
    expect(seoulToday(new Date('2026-10-16T14:59:59Z'))).toBe('2026-10-16')
  })

  it('returns the UTC instant of Seoul midnight for the current Seoul day', () => {
    expect(seoulDayStart(new Date('2026-10-16T15:30:00Z')).toISOString()).toBe(
      '2026-10-16T15:00:00.000Z',
    )
  })
})

describe('date arithmetic', () => {
  it('addDays crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('dayOfWeek returns 0 for Sunday', () => {
    expect(dayOfWeek('2026-10-16')).toBe(5)
    expect(dayOfWeek('2026-10-18')).toBe(0)
  })

  it('daysBetween counts whole days', () => {
    expect(daysBetween('2026-10-16', '2026-10-19')).toBe(3)
    expect(daysBetween('2026-10-19', '2026-10-16')).toBe(-3)
  })
})

describe('formatting', () => {
  it('formatKoreanDate prints month, day and Korean weekday', () => {
    expect(formatKoreanDate('2026-10-16')).toBe('10월 16일 (금)')
  })

  it('formatKoreanDateTime prints the Seoul wall-clock time', () => {
    expect(formatKoreanDateTime('2026-10-16T05:05:00Z')).toBe('2026. 10. 16. 14:05')
    expect(formatKoreanDateTime(new Date('2026-01-05T00:07:00Z'))).toBe('2026. 1. 5. 09:07')
  })

  it('toIsoString normalizes dates and handles empty values', () => {
    expect(toIsoString(null)).toBeNull()
    expect(toIsoString(undefined)).toBeNull()
    expect(toIsoString(new Date(0))).toBe('1970-01-01T00:00:00.000Z')
    expect(toIsoString('2026-10-16T05:05:00Z')).toBe('2026-10-16T05:05:00.000Z')
    expect(toIsoString('not a date')).toBeNull()
  })
})

describe('isPlausibleIsoDate', () => {
  it('accepts a real calendar date in the 2000-2100 range', () => {
    expect(isPlausibleIsoDate('2026-10-17')).toBe(true)
    expect(isPlausibleIsoDate('2000-01-01')).toBe(true)
    expect(isPlausibleIsoDate('2100-12-31')).toBe(true)
  })

  it('rejects years outside 2000-2100', () => {
    expect(isPlausibleIsoDate('0002-10-17')).toBe(false)
    expect(isPlausibleIsoDate('0020-10-17')).toBe(false)
    expect(isPlausibleIsoDate('1999-12-31')).toBe(false)
    expect(isPlausibleIsoDate('2101-01-01')).toBe(false)
    expect(isPlausibleIsoDate('10000-01-01')).toBe(false)
  })

  it('rejects dates that do not exist on the calendar', () => {
    expect(isPlausibleIsoDate('2026-02-31')).toBe(false)
    expect(isPlausibleIsoDate('2026-13-01')).toBe(false)
    expect(isPlausibleIsoDate('2026-00-10')).toBe(false)
    expect(isPlausibleIsoDate('2026-10-00')).toBe(false)
    expect(isPlausibleIsoDate('2024-02-29')).toBe(true)
    expect(isPlausibleIsoDate('2026-02-29')).toBe(false)
  })

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(isPlausibleIsoDate('10/20')).toBe(false)
    expect(isPlausibleIsoDate('2026-10-17T00:00:00Z')).toBe(false)
    expect(isPlausibleIsoDate('')).toBe(false)
  })
})
