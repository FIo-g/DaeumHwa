// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InterviewTurnRow } from '@/db/types'
import { postAction } from '@/lib/client/post-json'
import { InterviewSession } from './interview-session'

const state = vi.hoisted(() => ({ events: [] as string[] }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => {
      state.events.push('refresh')
    },
    push: vi.fn(),
  }),
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
  state.events.length = 0
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

describe('InterviewSession answer refresh', () => {
  it('refreshes after the answer request resolves, so a stale snapshot cannot hide the proposals', async () => {
    const question = turn()
    const answered = turn({ answer: '서윤은 검객이다.', answeredAt: new Date() })
    let resolveAnswer: (value: unknown) => void = () => {}
    const pendingAnswer = new Promise((resolve) => {
      resolveAnswer = (value) => {
        state.events.push('answer-resolved')
        resolve(value)
      }
    })
    vi.mocked(postAction).mockReturnValue(pendingAnswer as never)

    render(<InterviewSession workId="w1" canEdit sessionId="s1" turns={[]} current={question} />)
    fireEvent.change(screen.getByLabelText('답변'), { target: { value: '서윤은 검객이다.' } })
    fireEvent.click(screen.getByRole('button', { name: '답하기' }))

    const refreshesBeforeAnswer = state.events.filter((event) => event === 'refresh').length
    expect(refreshesBeforeAnswer).toBe(0)

    await act(async () => {
      resolveAnswer({ ok: true, data: { turn: answered, proposals: [] } })
    })

    await waitFor(() => expect(state.events).toContain('refresh'))
    const refreshesAfterAnswer = state.events.filter((event) => event === 'refresh').length
    expect(refreshesAfterAnswer).toBeGreaterThan(refreshesBeforeAnswer)
    expect(state.events.indexOf('answer-resolved')).toBeLessThan(state.events.indexOf('refresh'))
  })
})
