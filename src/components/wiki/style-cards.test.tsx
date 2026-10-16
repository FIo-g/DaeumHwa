// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { suggestStyleCardAction } from '@/server/actions/ai-features'
import { StyleCards } from './style-cards'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/ai-features', () => ({
  suggestStyleCardAction: vi.fn(),
}))

vi.mock('@/server/actions/wiki', () => ({
  createStyleCardAction: vi.fn(),
  updateStyleCardAction: vi.fn(),
  archiveStyleCardAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const suggest = vi.mocked(suggestStyleCardAction)

const characters = [
  { id: 'e1', name: '서윤' },
  { id: 'e2', name: '도현' },
]

const cards = [
  {
    id: 's1',
    name: '서윤 말투',
    entryId: 'e1',
    entryName: '서윤',
    tone: '짧고 단정하다',
    rules: '존댓말을 쓴다',
    examples: '"알겠습니다."',
  },
]

beforeEach(() => {
  run.mockResolvedValue({ id: 'p1' } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StyleCards', () => {
  it('shows each card with its linked character, tone, rules and examples', () => {
    render(<StyleCards workId="w1" cards={cards} characters={characters} canEdit />)
    const card = screen.getByText('서윤 말투').closest('article') as HTMLElement
    expect(within(card).getByText('서윤')).toBeInTheDocument()
    expect(within(card).getByText('짧고 단정하다')).toBeInTheDocument()
    expect(within(card).getByText('존댓말을 쓴다')).toBeInTheDocument()
    expect(within(card).getByText('"알겠습니다."')).toBeInTheDocument()
  })

  it('asks AI for a style card suggestion for a character and shows the approval toast', async () => {
    render(<StyleCards workId="w1" cards={cards} characters={characters} canEdit />)
    suggest.mockResolvedValue({ ok: true, data: { id: 'p2' } } as never)
    const row = screen.getByText('도현').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'AI로 문체 카드 제안' }))
    await waitFor(() => expect(suggest).toHaveBeenCalledWith({ workId: 'w1', entryId: 'e2' }))
    await waitFor(() => expect(run).toHaveBeenCalled())
    expect(run).toHaveBeenCalledWith(expect.anything(), {
      success: '문체 카드 제안을 승인 대기에 올렸습니다.',
    })
  })

  it('hides write controls from viewers', () => {
    render(<StyleCards workId="w1" cards={cards} characters={characters} canEdit={false} />)
    expect(screen.queryByRole('button', { name: '문체 카드 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'AI로 문체 카드 제안' })).not.toBeInTheDocument()
  })
})
