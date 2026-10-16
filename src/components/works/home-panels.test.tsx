// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HomePanels, type HomePanelsProps } from './home-panels'

afterEach(() => {
  cleanup()
})

const props: HomePanelsProps = {
  workId: 'w1',
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
    bufferWarning: '비축분이 목표보다 적습니다.',
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
    expect(screen.getByText('3건')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '승인 대기 보기' })).toHaveAttribute(
      'href',
      '/works/w1/approvals',
    )
  })

  it('marks overdue threads', () => {
    render(<HomePanels {...props} />)
    expect(screen.getByText('회수 목표 지남')).toBeInTheDocument()
  })

  it('writes the periodic check messages in Korean', () => {
    render(<HomePanels {...props} />)
    expect(
      screen.getByText('‘금빛 반지’ 회수 목표 5화가 지났습니다 (현재 8화).'),
    ).toBeInTheDocument()
    expect(screen.getByText('‘서윤’이(가) 6화째 등장하지 않았습니다.')).toBeInTheDocument()
    expect(screen.getByText('7일 넘게 기다리는 제안이 2건 있습니다.')).toBeInTheDocument()
    expect(screen.getByText('비축분이 목표보다 적습니다.')).toBeInTheDocument()
  })

  it('shows the empty message when no periodic check fires', () => {
    render(
      <HomePanels
        {...props}
        alerts={{
          overdueThreads: [],
          absentCharacters: [],
          stalePendingCount: 0,
          bufferWarning: null,
          total: 0,
        }}
      />,
    )
    expect(screen.getByText('지금 확인할 항목이 없습니다.')).toBeInTheDocument()
  })

  it('shows the recent change with its author', () => {
    render(<HomePanels {...props} />)
    expect(screen.getByText('인물 카드 수정: 서윤')).toBeInTheDocument()
    expect(screen.getByText('2026. 10. 16. 14:00')).toBeInTheDocument()
  })
})
