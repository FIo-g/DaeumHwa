import { describe, expect, it } from 'vitest'
import { computeSchedule } from '@/lib/schedule'
import type { ScheduleInput } from '@/db/types'

const settings = {
  absenceThreshold: 10,
  publishDays: [1, 2, 3, 4, 5],
  chaptersPerPublishDay: 1,
  bufferTarget: 5,
  targetChars: 5500,
}

function input(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    settings,
    chapters: [
      { id: 'c5', position: 5, title: '', status: 'done', publishedOn: null },
      { id: 'c6', position: 6, title: '', status: 'done', publishedOn: null },
      { id: 'c7', position: 7, title: '', status: 'done', publishedOn: null },
      { id: 'c8', position: 8, title: '', status: 'draft', publishedOn: null },
    ],
    items: [],
    ...overrides,
  }
}

describe('computeSchedule', () => {
  it('fills publish days with buffer chapters, skipping hiatus days', () => {
    const r = computeSchedule(
      input({
        items: [
          {
            id: 'h1',
            kind: 'hiatus',
            title: '휴재',
            date: '2026-10-19',
            endDate: '2026-10-19',
            done: false,
          },
        ],
      }),
      '2026-10-16',
    )
    expect(r.bufferCount).toBe(3)
    expect(r.slots.slice(0, 3)).toEqual([
      { date: '2026-10-16', chapterId: 'c5', chapterTitle: '5화', position: 5 },
      { date: '2026-10-20', chapterId: 'c6', chapterTitle: '6화', position: 6 },
      { date: '2026-10-21', chapterId: 'c7', chapterTitle: '7화', position: 7 },
    ])
    expect(r.slots.some((s) => s.date === '2026-10-19')).toBe(false)
    expect(r.bufferRunsOutOn).toBe('2026-10-22')
    expect(r.hiatusDays).toEqual(['2026-10-19'])
    expect(r.warnings).toContain('비축분이 목표(5화)보다 적습니다 (현재 3화).')
  })

  it('does not count published or unfinished chapters as buffer', () => {
    const r = computeSchedule(
      input({
        chapters: [
          { id: 'c1', position: 1, title: '', status: 'done', publishedOn: '2026-10-01' },
          { id: 'c2', position: 2, title: '', status: 'draft', publishedOn: null },
        ],
      }),
      '2026-10-16',
    )
    expect(r.bufferCount).toBe(0)
    expect(r.bufferRunsOutOn).toBe('2026-10-16')
  })

  it('warns about an undone deadline within three days', () => {
    const r = computeSchedule(
      input({
        items: [
          {
            id: 'd1',
            kind: 'deadline',
            title: '교정 마감',
            date: '2026-10-18',
            endDate: null,
            done: false,
          },
        ],
      }),
      '2026-10-16',
    )
    expect(r.warnings).toContain('마감이 2일 남았습니다: 교정 마감')
    expect(r.nextDeadline).toEqual({
      id: 'd1',
      title: '교정 마감',
      date: '2026-10-18',
      daysLeft: 2,
    })
  })

  it('warns about a past undone deadline and ignores done ones', () => {
    const r = computeSchedule(
      input({
        items: [
          {
            id: 'd1',
            kind: 'deadline',
            title: '지난 일',
            date: '2026-10-10',
            endDate: null,
            done: false,
          },
          {
            id: 'd2',
            kind: 'deadline',
            title: '끝난 일',
            date: '2026-10-17',
            endDate: null,
            done: true,
          },
        ],
      }),
      '2026-10-16',
    )
    expect(r.warnings).toContain('지난 마감이 있습니다: 지난 일')
    expect(r.warnings.some((w) => w.includes('끝난 일'))).toBe(false)
    expect(r.nextDeadline).toBeNull()
  })

  it('reports no buffer warning when the target is met', () => {
    const r = computeSchedule(
      input({
        chapters: Array.from({ length: 5 }, (_, i) => ({
          id: `c${i}`,
          position: i + 1,
          title: '',
          status: 'done' as const,
          publishedOn: null,
        })),
      }),
      '2026-10-16',
    )
    expect(r.warnings.some((w) => w.startsWith('비축분'))).toBe(false)
  })
})
