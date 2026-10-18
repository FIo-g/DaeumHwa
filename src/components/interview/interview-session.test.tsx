// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import type { InterviewTurnRow } from '@/db/types'
import { InterviewSession } from './interview-session'

vi.mock('@/lib/client/post-json', () => ({
  postAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

vi.mock('@/server/actions/interview', () => ({
  startInterviewAction: vi.fn(),
  completeInterviewAction: vi.fn(),
  skipTurnAction: vi.fn(),
}))

vi.mock('@/components/interview/answer-proposals', () => ({
  AnswerProposals: () => null,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function turn(overrides: Partial<InterviewTurnRow> = {}): InterviewTurnRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    topic: '주인공',
    question: '주인공은 누구인가요?',
    rationale: '주인공 카드를 채웁니다.',
    answer: null,
    skipped: false,
    proposalCount: 0,
    focus: 'setting',
    createdAt: new Date(),
    answeredAt: null,
    ...overrides,
  } as InterviewTurnRow
}

function renderSession(props: { current?: InterviewTurnRow | null; turns?: InterviewTurnRow[] }) {
  return render(
    <InterviewSession
      workId="w1"
      canEdit
      sessionId="s1"
      turns={props.turns ?? []}
      current={props.current ?? null}
    />,
  )
}

describe('InterviewSession question generation', () => {
  it('shows the setting badge for a setting question', () => {
    renderSession({ current: turn({ focus: 'setting' }) })
    expect(screen.getByText('설정 채우기')).toBeInTheDocument()
  })

  it('shows the story badge for a story question', () => {
    renderSession({ current: turn({ focus: 'story', topic: '중심 갈등' }) })
    expect(screen.getByText('다음 전개')).toBeInTheDocument()
    expect(screen.queryByText('설정 채우기')).not.toBeInTheDocument()
  })

  it('shows the elapsed seconds and a cancel button while the question is made', () => {
    vi.mocked(postAction).mockReturnValue(new Promise(() => {}))
    renderSession({})
    fireEvent.click(screen.getByRole('button', { name: '다음 질문' }))
    expect(screen.getByText('질문 만드는 중… 0초')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
  })

  it('shows a failure message and retries when the question fails', async () => {
    vi.mocked(postAction)
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'AI_ERROR', message: 'AI 호출에 실패했습니다.' },
      })
      .mockResolvedValueOnce({ ok: true, data: turn() })
    renderSession({})

    fireEvent.click(screen.getByRole('button', { name: '다음 질문' }))
    expect(await screen.findByText('질문을 만들지 못했습니다.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('주인공은 누구인가요?')).toBeInTheDocument()
    expect(postAction).toHaveBeenCalledTimes(2)
  })
})

describe('InterviewSession answers', () => {
  it('keeps the typed answer when saving the answer fails', async () => {
    vi.mocked(runAction).mockResolvedValue(null)
    renderSession({ current: turn() })

    const box = screen.getByLabelText('답변')
    fireEvent.change(box, { target: { value: '서윤은 검객이다.' } })
    fireEvent.click(screen.getByRole('button', { name: '답하기' }))

    await waitFor(() => expect(runAction).toHaveBeenCalled())
    expect(screen.getByLabelText('답변')).toHaveValue('서윤은 검객이다.')
  })

  it('shows the answer progress with a cancel button while the answer is organized', () => {
    vi.mocked(runAction).mockReturnValue(new Promise(() => {}))
    renderSession({ current: turn() })
    fireEvent.change(screen.getByLabelText('답변'), { target: { value: '서윤은 검객이다.' } })
    fireEvent.click(screen.getByRole('button', { name: '답하기' }))
    expect(screen.getByText('답 정리하는 중… 0초')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
  })
})
