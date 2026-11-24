// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HomePanels, type HomePanelsProps } from './home-panels'

afterEach(() => {
  cleanup()
})

const props: HomePanelsProps = {
  workId: 'w1',
  lastChapterPosition: 8,
  pendingCount: 3,
  openThreads: [
    {
      id: 't1',
      title: '금빛 반지',
      status: 'planted',
      plantedPosition: 2,
      targetPosition: 5,
      overdue: true,
    },
  ],
  alerts: {
    overdueThreads: [
      {
        id: 't1',
        title: '금빛 반지',
        targetPosition: 5,
        latestPosition: 8,
        overdueBy: 3,
      },
    ],
    absentCharacters: [{ id: 'e1', name: '서윤', lastPosition: 2, chaptersSince: 6 }],
    stalePendingCount: 2,
    bufferWarning: '비축분이 목표보다 적어요.',
    total: 4,
  },
  schedule: {
    bufferCount: 2,
    nextPublishDate: '2026-10-20',
    bufferRunsOutOn: '2026-10-27',
    nextDeadline: { title: '원고 마감', date: '2026-10-18', daysLeft: 2 },
  },
  recentChanges: [
    {
      id: 'c1',
      summary: '인물 카드 수정: 서윤',
      createdAt: new Date('2026-10-16T05:00:00.000Z'),
    },
  ],
}

describe('HomePanels', () => {
  it('links the approval panel to the approvals page with the count', () => {
    render(<HomePanels {...props} />)
    const approvals = screen.getByRole('region', { name: '승인 대기' })
    expect(approvals.querySelector('.wg-home-total-number')?.textContent).toBe('3건')
    expect(screen.getByRole('link', { name: '승인 대기 보기' })).toHaveAttribute(
      'href',
      '/works/w1/approvals',
    )
  })

  it('marks overdue threads', () => {
    render(<HomePanels {...props} />)
    expect(screen.getByText('회수 목표 지남')).toBeInTheDocument()
  })

  it('connects planted and planned threads and centers both marks on a shared chapter', () => {
    const [planted] = props.openThreads
    render(
      <HomePanels
        {...props}
        openThreads={[
          planted,
          { ...planted, id: 't2', title: '같은 화', targetPosition: planted.plantedPosition },
          { ...planted, id: 't3', title: '계획', status: 'planned', plantedPosition: null },
        ]}
      />,
    )
    const [first, sharedChapter, planned] = screen.getAllByRole('article')
    expect(first.querySelector('.wg-home-axis-line')).toHaveAttribute('data-planned', 'false')
    expect(first.querySelector('.wg-home-planted')).not.toBeNull()
    expect(first.querySelector('.wg-home-target')).not.toBeNull()
    const dot = sharedChapter.querySelector<HTMLElement>('.wg-home-planted')
    const target = sharedChapter.querySelector<HTMLElement>('.wg-home-target')
    expect(dot?.style.insetInlineStart).toBe('18.75%')
    expect(target?.style.insetInlineStart).toBe('18.75%')
    expect(dot).toHaveAttribute('data-thread-coincident', 'seed')
    expect(target).toHaveAttribute('data-thread-coincident', 'target')
    expect(planned.querySelector('.wg-home-axis-line')).toHaveAttribute('data-planned', 'true')
    expect(planned.querySelector('.wg-home-planted')).toBeNull()
    expect(planned.querySelector('.wg-home-target')).not.toBeNull()
  })

  it.each([3, 6, 12])(
    'puts the first and last marks at their cell centers for %i chapters',
    (count) => {
      render(
        <HomePanels
          {...props}
          lastChapterPosition={count}
          openThreads={[{ ...props.openThreads[0], plantedPosition: 1, targetPosition: count }]}
        />,
      )
      const plot = screen.getByRole('article').querySelector<HTMLElement>('.wg-home-axis')
      expect(plot?.style.getPropertyValue('--wg-home-axis-cells')).toBe(String(count))
      const x = (marker: string) =>
        Number.parseFloat(plot!.querySelector<HTMLElement>(marker)!.style.insetInlineStart)
      expect(x('.wg-home-planted')).toBeCloseTo(100 / count / 2)
      expect(x('.wg-home-target')).toBeCloseTo(100 - 100 / count / 2)
    },
  )

  it('writes the periodic check messages in Korean', () => {
    render(<HomePanels {...props} />)
    expect(screen.getByText('‘금빛 반지’ 회수 목표 5화가 지났어요 (현재 8화).')).toBeInTheDocument()
    expect(screen.getByText('‘서윤’이(가) 6화째 등장하지 않았어요.')).toBeInTheDocument()
    expect(screen.getByText('7일 넘게 기다리는 제안이 2건 있어요.')).toBeInTheDocument()
    expect(screen.getByText('비축분이 목표보다 적어요.')).toBeInTheDocument()
  })

  it('shows the empty message when no periodic check fires', () => {
    render(
      <HomePanels
        {...props}
        pendingCount={0}
        openThreads={[]}
        alerts={{
          overdueThreads: [],
          absentCharacters: [],
          stalePendingCount: 0,
          bufferWarning: null,
          total: 0,
        }}
      />,
    )
    expect(screen.getByText('지금 확인할 항목이 없어요.')).toBeInTheDocument()
    expect(screen.getByText('열린 떡밥이 없어요.')).toBeInTheDocument()
    for (const name of ['승인 대기', '주기 점검']) {
      const panel = screen.getByRole('region', { name })
      expect(panel.querySelector('.wg-home-total-number')?.textContent).toBe('0건')
    }
  })

  it('keeps five alerts and the existing thread preview limit for a dense work', () => {
    const openThreads = Array.from({ length: 12 }, (_, index) => ({
      ...props.openThreads[0],
      id: `t${index + 1}`,
      title: `떡밥 ${index + 1}`,
    }))
    render(
      <HomePanels
        {...props}
        openThreads={openThreads}
        alerts={{
          ...props.alerts,
          absentCharacters: [
            ...props.alerts.absentCharacters,
            { id: 'e2', name: '수빈', lastPosition: 3, chaptersSince: 5 },
          ],
          total: 5,
        }}
      />,
    )

    const alerts = screen.getByRole('region', { name: '주기 점검' })
    expect(alerts.querySelector('.wg-home-total-number')?.textContent).toBe('5건')
    expect(within(alerts).getAllByRole('listitem')).toHaveLength(5)
    const threads = within(screen.getByRole('region', { name: '열린 떡밥' }))
    expect(threads.getAllByRole('article')).toHaveLength(5)
    expect(threads.getByRole('link', { name: '떡밥 장부 보기' })).toBeInTheDocument()
  })

  it('shows the recent change with its author', () => {
    render(<HomePanels {...props} />)
    expect(screen.getByText('인물 카드 수정: 서윤')).toBeInTheDocument()
    expect(screen.getByText('2026. 10. 16. 14:00')).toBeInTheDocument()
  })
})
