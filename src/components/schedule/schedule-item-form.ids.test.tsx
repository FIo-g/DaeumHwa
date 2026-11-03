// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScheduleItemForm } from './schedule-item-form'
import type { ScheduleItemView } from './schedule-item-list'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/schedule', () => ({
  createScheduleItemAction: vi.fn(),
  updateScheduleItemAction: vi.fn(),
  deleteScheduleItemAction: vi.fn(),
  setScheduleItemDoneAction: vi.fn(),
}))

const item: ScheduleItemView = {
  id: 'i1',
  kind: 'deadline',
  title: '마감',
  date: '2026-11-10',
  endDate: null,
  chapterId: null,
  note: '',
  done: false,
}

afterEach(() => {
  cleanup()
})

describe('ScheduleItemForm ids', () => {
  it('keeps the add form and the edit form ids unique and their labels attached to their own fields', () => {
    render(
      <div data-testid="forms">
        <ScheduleItemForm workId="w1" today="2026-11-10" chapters={[]} />
        <ScheduleItemForm workId="w1" today="2026-11-10" chapters={[]} item={item} />
      </div>,
    )

    const container = screen.getByTestId('forms')
    const ids = Array.from(container.querySelectorAll<HTMLElement>('[id]')).map(
      (element) => element.id,
    )
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)

    const forms = Array.from(container.querySelectorAll('form'))
    expect(forms).toHaveLength(2)
    for (const form of forms) {
      const labels = Array.from(form.querySelectorAll<HTMLLabelElement>('label[for]'))
      expect(labels.length).toBeGreaterThan(0)
      for (const label of labels) {
        const target = document.getElementById(label.htmlFor)
        expect(target, `label "${label.textContent}" has no field`).not.toBeNull()
        expect(form.contains(target), `label "${label.textContent}" points outside its form`).toBe(
          true,
        )
      }
    }
  })
})
