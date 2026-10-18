// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { postAction } from '@/lib/client/post-json'
import type { InterviewTurnRow } from '@/db/types'
import { InterviewSession } from './interview-session'

const routerMock = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerMock.refresh, push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

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
  vi.resetAllMocks()
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
    expect(screen.getByText('AI 호출에 실패했습니다.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('주인공은 누구인가요?')).toBeInTheDocument()
    expect(postAction).toHaveBeenCalledTimes(2)
  })

  it('refreshes the page after a question is made, so a stale refresh cannot hide it', async () => {
    vi.mocked(postAction).mockResolvedValueOnce({ ok: true, data: turn() })
    renderSession({})

    fireEvent.click(screen.getByRole('button', { name: '다음 질문' }))
    expect(await screen.findByText('주인공은 누구인가요?')).toBeInTheDocument()
    expect(routerMock.refresh).toHaveBeenCalled()
  })

  it('shows the timeout message and keeps the retry button', async () => {
    vi.mocked(postAction).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'AI_ERROR',
        message: 'AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도해 주세요.',
      },
    })
    renderSession({})

    fireEvent.click(screen.getByRole('button', { name: '다음 질문' }))
    expect(
      await screen.findByText('AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('shows the daily limit message and hides the retry button', async () => {
    vi.mocked(postAction).mockResolvedValueOnce({
      ok: false,
      error: { code: 'AI_LIMIT', message: '오늘 AI 사용량을 모두 썼습니다.' },
    })
    renderSession({})

    fireEvent.click(screen.getByRole('button', { name: '다음 질문' }))
    expect(await screen.findByText('오늘 AI 사용량을 모두 썼습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  it('reloads the turn state when the question is cancelled', async () => {
    vi.mocked(postAction).mockReturnValue(new Promise(() => {}))
    renderSession({})
    fireEvent.click(screen.getByRole('button', { name: '다음 질문' }))
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled())
    expect(screen.queryByText('질문을 만들지 못했습니다.')).not.toBeInTheDocument()
  })
})

describe('InterviewSession answers', () => {
  it('keeps the typed answer when saving the answer fails', async () => {
    vi.mocked(postAction).mockResolvedValue({
      ok: false,
      error: { code: 'BAD_STATE', message: '잠시 후 다시 시도해 주세요.' },
    })
    renderSession({ current: turn() })

    const box = screen.getByLabelText('답변')
    fireEvent.change(box, { target: { value: '서윤은 검객이다.' } })
    fireEvent.click(screen.getByRole('button', { name: '답하기' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('잠시 후 다시 시도해 주세요.'))
    expect(screen.getByLabelText('답변')).toHaveValue('서윤은 검객이다.')
  })

  it('shows the answer progress with a cancel button while the answer is organized', () => {
    vi.mocked(postAction).mockReturnValue(new Promise(() => {}))
    renderSession({ current: turn() })
    fireEvent.change(screen.getByLabelText('답변'), { target: { value: '서윤은 검객이다.' } })
    fireEvent.click(screen.getByRole('button', { name: '답하기' }))
    expect(screen.getByText('답 정리하는 중… 0초')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
  })

  it('reloads the turn state when the answer is cancelled, since the server may have saved it', async () => {
    vi.mocked(postAction).mockReturnValue(new Promise(() => {}))
    renderSession({ current: turn() })
    fireEvent.change(screen.getByLabelText('답변'), { target: { value: '서윤은 검객이다.' } })
    fireEvent.click(screen.getByRole('button', { name: '답하기' }))
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled())
    expect(screen.getByLabelText('답변')).toHaveValue('서윤은 검객이다.')
  })

  it('follows the fresh turn state from the server after a reload', () => {
    const view = renderSession({ current: turn() })
    expect(screen.getByLabelText('답변')).toBeInTheDocument()

    view.rerender(
      <InterviewSession
        workId="w1"
        canEdit
        sessionId="s1"
        turns={[turn({ answer: '서윤은 검객이다.', answeredAt: new Date() })]}
        current={null}
      />,
    )
    expect(screen.queryByLabelText('답변')).not.toBeInTheDocument()
    expect(screen.getByText('지난 질문 1개 보기')).toBeInTheDocument()
  })

  it('reloads the turn state when the server says the question is already answered', async () => {
    vi.mocked(postAction).mockResolvedValue({
      ok: false,
      error: { code: 'CONFLICT', message: '이미 답한 질문입니다.' },
    })
    renderSession({ current: turn() })
    fireEvent.change(screen.getByLabelText('답변'), { target: { value: '서윤은 검객이다.' } })
    fireEvent.click(screen.getByRole('button', { name: '답하기' }))

    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledWith('이미 답한 질문입니다.')
  })
})
