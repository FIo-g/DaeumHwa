// @vitest-environment jsdom
// Stage 2 (task 6): the plan card suggests lasting requests and keeps them in one click.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DraftPlanCard } from '@/lib/draft-plan'
import { createDirectiveAction } from '@/server/actions/wiki'
import { toast } from 'sonner'
import { DraftPlanCardView } from './draft-plan-card'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createDirectiveAction: vi.fn(),
}))

function makeCard(requests: string[] = []): DraftPlanCard {
  return {
    scenes: [
      {
        summary: '성문 앞에 선다.',
        goal: '안으로 들어간다',
        decision: '',
        stake: '',
        trigger: '',
        role: 'opening',
        place: '성문',
        characters: [],
        targetChars: 1250,
      },
      {
        summary: '문이 열린다.',
        goal: '',
        decision: '',
        stake: '',
        trigger: '',
        role: 'ending',
        place: '',
        characters: [],
        targetChars: 1250,
      },
    ],
    ending: { device: 'question', line: '누가 문을 열었나?' },
    threads: [],
    requests,
  }
}

function renderView(requests: string[] = []) {
  const handlers = { onChange: vi.fn(), onRevise: vi.fn(), onWrite: vi.fn() }
  render(
    <DraftPlanCardView
      card={makeCard(requests)}
      warnings={[]}
      busy={false}
      workId="work-1"
      {...handlers}
    />,
  )
  return handlers
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('DraftPlanCardView requests (stage 2)', () => {
  it('shows no request section without requests', () => {
    renderView([])
    expect(screen.queryByText('계속 지킬 요청으로 보이는 것')).not.toBeInTheDocument()
  })

  it('keeps a suggested request with source suggested and shows it is kept', async () => {
    vi.mocked(createDirectiveAction).mockResolvedValue({ ok: true, data: {} } as never)
    renderView(['윤서는 존댓말을 쓴다', '비 오는 장면은 피한다'])

    expect(screen.getByText('계속 지킬 요청으로 보이는 것')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '앞으로도 지키기' })[0])

    await waitFor(() => expect(screen.getByText('장부에 넣었습니다')).toBeInTheDocument())
    expect(createDirectiveAction).toHaveBeenCalledWith({
      workId: 'work-1',
      scope: 'work',
      kind: 'content',
      text: '윤서는 존댓말을 쓴다',
      source: 'suggested',
    })
  })

  it('passes the note with its keep flag when the box is checked, and keeps nothing itself', async () => {
    const { onRevise } = renderView()

    fireEvent.click(screen.getByRole('checkbox', { name: '앞으로도 이렇게' }))
    fireEvent.change(screen.getByLabelText('계획 고치는 말'), {
      target: { value: '2장면에서 윤서가 먼저 말을 걸게' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    expect(onRevise).toHaveBeenCalledWith('2장면에서 윤서가 먼저 말을 걸게', true)
    // The panel keeps the note once the target check passes (stage 2 review, A1).
    expect(createDirectiveAction).not.toHaveBeenCalled()
  })

  it('does not keep the note when the box is not checked', () => {
    const { onRevise } = renderView()

    fireEvent.change(screen.getByLabelText('계획 고치는 말'), { target: { value: '고쳐 주세요' } })
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    expect(onRevise).toHaveBeenCalledWith('고쳐 주세요', false)
    expect(createDirectiveAction).not.toHaveBeenCalled()
  })

  it('still revises the plan when the box is checked, since the panel does the keeping', async () => {
    const { onRevise } = renderView()

    fireEvent.click(screen.getByRole('checkbox', { name: '앞으로도 이렇게' }))
    fireEvent.change(screen.getByLabelText('계획 고치는 말'), { target: { value: '고쳐 주세요' } })
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    await waitFor(() => expect(onRevise).toHaveBeenCalledWith('고쳐 주세요', true))
    expect(createDirectiveAction).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
