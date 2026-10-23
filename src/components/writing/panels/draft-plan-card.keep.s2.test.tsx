// @vitest-environment jsdom
// Stage 2 review (group A1): a suggested request is kept once, even on a double click, and a
// revision note is handed to the panel with its keep flag instead of being kept by the card.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DraftPlanCard } from '@/lib/draft-plan'
import { createDirectiveAction } from '@/server/actions/wiki'
import { DraftPlanCardView } from './draft-plan-card'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createDirectiveAction: vi.fn(),
}))

function makeCard(requests: string[]): DraftPlanCard {
  return {
    scenes: [
      {
        summary: '성문 앞에 선다.',
        goal: '',
        decision: '',
        stake: '',
        trigger: '',
        role: 'opening',
        place: '',
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
  const handlers = { onChange: vi.fn(), onRevise: vi.fn(), onWrite: vi.fn(), onKept: vi.fn() }
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

describe('DraftPlanCardView keep guard (stage 2 review)', () => {
  it('creates one request for a double click on 앞으로도 지키기', async () => {
    let resolve: (value: unknown) => void = () => {}
    vi.mocked(createDirectiveAction).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }) as never,
    )
    const { onKept } = renderView(['세린은 누구에게나 반말을 한다.'])
    const button = screen.getByRole('button', { name: '앞으로도 지키기' })

    fireEvent.click(button)
    fireEvent.click(button)
    expect(createDirectiveAction).toHaveBeenCalledTimes(1)

    resolve({ ok: true, data: {} })
    await waitFor(() => expect(screen.getByText('장부에 넣었습니다')).toBeInTheDocument())
    expect(createDirectiveAction).toHaveBeenCalledTimes(1)
    expect(onKept).toHaveBeenCalledTimes(1)
  })

  it('hands the revision note and its keep flag to onRevise without creating a request', () => {
    const { onRevise } = renderView()

    fireEvent.click(screen.getByRole('checkbox', { name: '앞으로도 이렇게' }))
    fireEvent.change(screen.getByLabelText('계획 고치는 말'), {
      target: { value: '2장면에서 윤서가 먼저 말을 걸게' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    expect(onRevise).toHaveBeenCalledWith('2장면에서 윤서가 먼저 말을 걸게', true)
    expect(createDirectiveAction).not.toHaveBeenCalled()
  })
})
