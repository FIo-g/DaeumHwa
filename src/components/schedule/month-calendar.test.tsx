// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MonthCalendar } from './month-calendar'

const slots = [
  { date: '2026-10-05', chapterId: 'c3', chapterTitle: '3화 재회', position: 3 },
  { date: '2026-10-06', chapterId: null, chapterTitle: null, position: null },
]

const items = [
  {
    id: 'h1',
    kind: 'hiatus' as const,
    title: '휴재',
    date: '2026-10-12',
    endDate: '2026-10-13',
    done: false,
  },
  {
    id: 'd1',
    kind: 'deadline' as const,
    title: '1차 원고 마감',
    date: '2026-10-20',
    endDate: null,
    done: false,
  },
  {
    id: 'd2',
    kind: 'event' as const,
    title: '사진 촬영',
    date: '2026-10-22',
    endDate: null,
    done: true,
  },
]

function cellOf(container: HTMLElement, date: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-date="${date}"]`)
  if (!el) throw new Error(`no cell for ${date}`)
  return el
}

afterEach(() => {
  cleanup()
})

describe('MonthCalendar', () => {
  it('starts the October 2026 grid on the Sunday 2026-09-27 and ends on a Saturday', () => {
    const { container } = render(
      <MonthCalendar
        month="2026-10"
        today="2026-10-16"
        slots={[]}
        items={[]}
        onMonthChange={() => {}}
      />,
    )
    const cells = container.querySelectorAll('[data-date]')
    expect(cells[0]).toHaveAttribute('data-date', '2026-09-27')
    expect(cells[cells.length - 1]).toHaveAttribute('data-date', '2026-10-31')
    expect(cells).toHaveLength(35)
    expect(screen.getByRole('heading', { name: '2026년 10월' })).toBeInTheDocument()
  })

  it('shows chapter labels on publish slot days and 빈 연재일 on empty slots', () => {
    const { container } = render(
      <MonthCalendar
        month="2026-10"
        today="2026-10-16"
        slots={slots}
        items={[]}
        onMonthChange={() => {}}
      />,
    )
    expect(within(cellOf(container, '2026-10-05')).getByText('3화 재회')).toBeInTheDocument()
    const empty = within(cellOf(container, '2026-10-06')).getByText('빈 연재일')
    expect(empty.className).toContain('text-red')
  })

  it('marks every hiatus day with 휴재 and leaves other days alone', () => {
    const { container } = render(
      <MonthCalendar
        month="2026-10"
        today="2026-10-16"
        slots={[]}
        items={items}
        onMonthChange={() => {}}
      />,
    )
    expect(within(cellOf(container, '2026-10-12')).getByText('휴재')).toBeInTheDocument()
    expect(within(cellOf(container, '2026-10-13')).getByText('휴재')).toBeInTheDocument()
    expect(within(cellOf(container, '2026-10-14')).queryByText('휴재')).toBeNull()
  })

  it('shows deadline titles on their day and strikes through done items', () => {
    const { container } = render(
      <MonthCalendar
        month="2026-10"
        today="2026-10-16"
        slots={[]}
        items={items}
        onMonthChange={() => {}}
      />,
    )
    expect(within(cellOf(container, '2026-10-20')).getByText('1차 원고 마감')).toBeInTheDocument()
    expect(within(cellOf(container, '2026-10-22')).getByText('사진 촬영').className).toContain(
      'line-through',
    )
  })

  it('outlines today and marks it as the current date', () => {
    const { container } = render(
      <MonthCalendar
        month="2026-10"
        today="2026-10-16"
        slots={[]}
        items={[]}
        onMonthChange={() => {}}
      />,
    )
    const today = cellOf(container, '2026-10-16')
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(today.className).toContain('outline-2')
    expect(cellOf(container, '2026-10-15')).not.toHaveAttribute('aria-current')
  })

  it('moves to the previous and next month through the callback', () => {
    const onMonthChange = vi.fn()
    render(
      <MonthCalendar
        month="2026-10"
        today="2026-10-16"
        slots={[]}
        items={[]}
        onMonthChange={onMonthChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-11')
    fireEvent.click(screen.getByRole('button', { name: '이전 달' }))
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-09')
  })
})

describe('MonthCalendar hiatus items', () => {
  it('does not mark a done hiatus as 휴재, because its days are open again', () => {
    const doneHiatus = [
      {
        id: 'h2',
        kind: 'hiatus' as const,
        title: '여행',
        date: '2026-10-19',
        endDate: '2026-10-19',
        done: true,
      },
    ]
    const { container } = render(
      <MonthCalendar
        month="2026-10"
        today="2026-10-16"
        slots={[]}
        items={doneHiatus}
        onMonthChange={() => {}}
      />,
    )
    expect(within(cellOf(container, '2026-10-19')).queryByText('휴재')).toBeNull()
    expect(within(cellOf(container, '2026-10-19')).getByText('여행').className).toContain(
      'line-through',
    )
  })
})
