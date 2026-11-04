// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ENTRY_KIND_LABEL,
  FACT_STATUS_LABEL,
  THREAD_STATUS_LABEL,
  chapterLabel,
} from '@/lib/labels'
import { getCheckContextAction } from '@/server/actions/checks'
import type { CheckContextView } from '@/server/check-context'
import { CheckContext } from './check-context'

vi.mock('@/server/actions/checks', () => ({
  getCheckContextAction: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const action = vi.mocked(getCheckContextAction)

function makeView(overrides: Partial<CheckContextView> = {}): CheckContextView {
  return {
    position: 3,
    entries: [
      {
        id: 'e1',
        name: '서윤',
        kind: 'character',
        facts: [
          {
            id: 'f1',
            content: '서윤은 왼손잡이다.',
            status: 'confirmed',
            validFromPosition: 3,
            validToPosition: null,
          },
        ],
      },
    ],
    trimmedEntryNames: ['한세린'],
    threads: [
      {
        id: 't1',
        title: '어머니의 편지',
        status: 'planted',
        targetPosition: 2,
        overdue: true,
      },
    ],
    previousSummaries: [{ position: 2, title: '잿빛 종루 아래' }],
    relationCount: 1,
    namingRuleCount: 0,
    totalEntries: 5,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('CheckContext', () => {
  it('loads the view when opened and lists cards, facts and threads', async () => {
    action.mockResolvedValue({ ok: true, data: makeView() })
    render(<CheckContext workId="w1" chapterId="c3" position={3} refreshKey={0} />)

    expect(action).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'AI가 참고한 설정 보기' }))

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action).toHaveBeenCalledWith({ chapterId: 'c3' })

    expect(
      await screen.findByText(
        '회차 점검은 저장된 원고에 나온 카드와 3화에 유효한 사실, 열린 떡밥, 앞 회차 요약만 AI에 보냅니다.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('설정 카드 1개 (전체 5개 중)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '서윤' })).toHaveAttribute(
      'href',
      '/works/w1/wiki/entries/e1',
    )
    expect(screen.getByText(ENTRY_KIND_LABEL.character)).toBeInTheDocument()
    expect(screen.getByText('서윤은 왼손잡이다.')).toBeInTheDocument()
    expect(screen.getByText(FACT_STATUS_LABEL.confirmed)).toBeInTheDocument()
    expect(screen.getByText('3화부터')).toBeInTheDocument()
    expect(screen.getByText('분량 한도로 빠진 카드: 한세린')).toBeInTheDocument()
    expect(screen.getByText('열린 떡밥 1개')).toBeInTheDocument()
    expect(screen.getByText(THREAD_STATUS_LABEL.planted)).toBeInTheDocument()
    expect(screen.getByText('회수 목표 2화')).toBeInTheDocument()
    expect(screen.getByText('회수 목표 지남')).toBeInTheDocument()
    expect(screen.getByText('앞 회차 요약')).toBeInTheDocument()
    expect(screen.getByText(chapterLabel(2, '잿빛 종루 아래'))).toBeInTheDocument()
    expect(screen.getByText('관계 1개, 이름 규칙 0개도 함께 보냅니다.')).toBeInTheDocument()
  })

  it('shows the empty card message', async () => {
    action.mockResolvedValue({ ok: true, data: makeView({ entries: [], trimmedEntryNames: [] }) })
    render(<CheckContext workId="w1" chapterId="c3" position={3} refreshKey={0} />)

    fireEvent.click(screen.getByRole('button', { name: 'AI가 참고한 설정 보기' }))

    expect(await screen.findByText('원고에 이름이 나온 설정 카드가 없습니다.')).toBeInTheDocument()
  })

  it('names trimmed cards even when no card is listed', async () => {
    action.mockResolvedValue({
      ok: true,
      data: makeView({ entries: [], trimmedEntryNames: ['한세린', '박도현'] }),
    })
    render(<CheckContext workId="w1" chapterId="c3" position={3} refreshKey={0} />)

    fireEvent.click(screen.getByRole('button', { name: 'AI가 참고한 설정 보기' }))

    expect(await screen.findByText('원고에 이름이 나온 설정 카드가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('분량 한도로 빠진 카드: 한세린, 박도현')).toBeInTheDocument()
  })

  it('reloads when a check finishes while open', async () => {
    action.mockResolvedValue({ ok: true, data: makeView() })
    const { rerender } = render(
      <CheckContext workId="w1" chapterId="c3" position={3} refreshKey={0} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'AI가 참고한 설정 보기' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))

    rerender(<CheckContext workId="w1" chapterId="c3" position={3} refreshKey={1} />)
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: '접기' }))
    rerender(<CheckContext workId="w1" chapterId="c3" position={3} refreshKey={2} />)
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('shows an error line when loading fails', async () => {
    action.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: '회차를 찾을 수 없습니다.' },
    })
    render(<CheckContext workId="w1" chapterId="c3" position={3} refreshKey={0} />)

    fireEvent.click(screen.getByRole('button', { name: 'AI가 참고한 설정 보기' }))

    expect(await screen.findByText('불러오지 못했습니다.')).toBeInTheDocument()
  })
})
