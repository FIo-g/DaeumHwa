// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type DraftPlanCard, PLAN_TEXT_MAX } from '@/lib/draft-plan'
import { DraftPlanCardView } from './draft-plan-card'

function makeCard(): DraftPlanCard {
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
        characters: ['주인공'],
        targetChars: 1250,
      },
      {
        summary: '경비와 맞선다.',
        goal: '통과한다',
        decision: '싸우기로 한다',
        stake: '시간을 잃는다',
        trigger: '',
        role: 'rise',
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
    threads: ['성문의 비밀'],
  }
}

function renderView(card: DraftPlanCard = makeCard()) {
  const handlers = {
    onChange: vi.fn(),
    onRevise: vi.fn(),
    onWrite: vi.fn(),
  }
  render(<DraftPlanCardView card={card} warnings={[]} busy={false} {...handlers} />)
  return handlers
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('DraftPlanCardView', () => {
  it('shows the card heading, the scene line and the ending line', () => {
    renderView()

    expect(screen.getByText('이번 화 계획')).toBeInTheDocument()
    expect(screen.getByText('장면 2 · 고조 · 약 1,250자')).toBeInTheDocument()
    expect(screen.getByText('회차 끝 (질문): 누가 문을 열었나?')).toBeInTheDocument()
    expect(screen.getByText('움직일 떡밥: 성문의 비밀')).toBeInTheDocument()
  })

  it('omits the rows whose value is empty', () => {
    renderView()

    // Only scene 2 has a decision.
    expect(screen.getAllByText('결정')).toHaveLength(1)
  })

  it('disables the remove button when one scene is left', () => {
    const card = makeCard()
    renderView({ ...card, scenes: [card.scenes[0]] })

    expect(screen.getByRole('button', { name: '빼기' })).toBeDisabled()
  })

  it('removes a scene and reports the removal as an edit', () => {
    const { onChange } = renderView()

    fireEvent.click(screen.getAllByRole('button', { name: '빼기' })[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    const [next, edit] = onChange.mock.calls[0]
    expect(next.scenes).toHaveLength(2)
    expect(next.scenes[0].summary).toBe('경비와 맞선다.')
    expect(edit).toBe('removed')
  })

  it('moves a scene down and reports the move as an edit', () => {
    const { onChange } = renderView()

    fireEvent.click(screen.getAllByRole('button', { name: '아래로' })[0])

    const [next, edit] = onChange.mock.calls[0]
    expect(next.scenes[0].summary).toBe('경비와 맞선다.')
    expect(next.scenes[1].summary).toBe('성문 앞에 선다.')
    expect(edit).toBe('moved')
  })

  it('reports a summary change to the panel without an edit kind', () => {
    const onChange = vi.fn()
    // A stateful wrapper: the card changes on every keystroke, as it does in the panel.
    function Harness() {
      const [card, setCard] = useState(makeCard())
      return (
        <DraftPlanCardView
          card={card}
          warnings={[]}
          busy={false}
          onChange={(next, edit) => {
            onChange(next, edit)
            setCard(next)
          }}
          onRevise={vi.fn()}
          onWrite={vi.fn()}
        />
      )
    }
    render(<Harness />)
    const summary = screen.getAllByLabelText('일어나는 일')[1]

    fireEvent.focus(summary)
    fireEvent.change(summary, { target: { value: '경비를 설득한다.' } })
    fireEvent.change(summary, { target: { value: '경비를 설득해 본다.' } })
    fireEvent.blur(summary)

    // A summary change is not an edit kind: the panel counts changed scenes from the card itself.
    expect(onChange).toHaveBeenCalled()
    for (const call of onChange.mock.calls) {
      expect(call[1]).toBeUndefined()
    }
    expect(onChange.mock.calls.at(-1)?.[0].scenes[1].summary).toBe('경비를 설득해 본다.')
  })

  it('sends the revision note with 다시 계획', () => {
    const { onRevise } = renderView()

    fireEvent.change(
      screen.getByPlaceholderText(
        '계획을 한 줄로 고쳐 주세요 (예: 2장면에서 윤서가 먼저 말을 걸게)',
      ),
      { target: { value: '윤서가 먼저' } },
    )
    fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))

    expect(onRevise).toHaveBeenCalledWith('윤서가 먼저')
  })

  it('caps the 일어나는 일 textarea at the card limit', () => {
    renderView()
    const summaries = screen.getAllByLabelText('일어나는 일')
    for (const summary of summaries) {
      expect(summary.getAttribute('maxlength')).toBe(String(PLAN_TEXT_MAX))
    }
    expect(PLAN_TEXT_MAX).toBe(400)
  })

  it('calls onWrite from 이 계획으로 쓰기', () => {
    const { onWrite } = renderView()

    fireEvent.click(screen.getByRole('button', { name: '이 계획으로 쓰기' }))

    expect(onWrite).toHaveBeenCalledTimes(1)
  })
})

function Harness({
  onChange,
  targetChars,
}: {
  onChange: (next: DraftPlanCard, edit?: string) => void
  targetChars?: number | null
}) {
  const [card, setCard] = useState(makeCard())
  return (
    <DraftPlanCardView
      card={card}
      warnings={[]}
      busy={false}
      targetChars={targetChars}
      onChange={(next, edit) => {
        onChange(next, edit)
        setCard(next)
      }}
      onRevise={vi.fn()}
      onWrite={vi.fn()}
    />
  )
}

describe('DraftPlanCardView focus and lengths', () => {
  it('keeps focus on the moved scene, so the next 아래로 moves that scene again', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const user = userEvent.setup()

    screen.getAllByRole('button', { name: '아래로' })[0].focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')

    const summaries = screen
      .getAllByLabelText('일어나는 일')
      .map((el) => (el as HTMLTextAreaElement).value)
    expect(summaries).toEqual(['경비와 맞선다.', '문이 열린다.', '성문 앞에 선다.'])
    expect(onChange.mock.calls.map((call) => call[1])).toEqual(['moved', 'moved'])
    const active = document.activeElement as HTMLElement
    expect(active.closest('li')?.querySelector('textarea')?.value).toBe('성문 앞에 선다.')
  })

  it('moves focus to a control that still exists when 빼기 removes the last scene', async () => {
    render(<Harness onChange={vi.fn()} />)
    const user = userEvent.setup()

    screen.getAllByRole('button', { name: '빼기' })[2].focus()
    await user.keyboard('{Enter}')

    expect(screen.getAllByLabelText('일어나는 일')).toHaveLength(2)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('removes a scene at the current chapter target, not at the summed card targets', () => {
    const card = makeCard()
    const onChange = vi.fn()
    render(
      <DraftPlanCardView
        card={{ ...card, scenes: card.scenes.map((scene) => ({ ...scene, targetChars: 1667 })) }}
        warnings={[]}
        busy={false}
        targetChars={5000}
        onChange={onChange}
        onRevise={vi.fn()}
        onWrite={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: '빼기' })[0])

    const [next] = onChange.mock.calls[0]
    expect(next.scenes.every((scene: { targetChars: number }) => scene.targetChars === 2500)).toBe(
      true,
    )
  })
})
