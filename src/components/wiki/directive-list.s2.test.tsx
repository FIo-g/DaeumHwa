// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { createDirectiveAction, updateDirectiveAction } from '@/server/actions/wiki'
import { DirectiveList, type DirectiveItem } from './directive-list'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createDirectiveAction: vi.fn(),
  updateDirectiveAction: vi.fn(),
  archiveDirectiveAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const create = vi.mocked(createDirectiveAction)
const update = vi.mocked(updateDirectiveAction)

const base = {
  workId: 'w1',
  source: 'author' as const,
  pattern: null,
  speechLevel: null,
  targetChars: null,
  chapterPosition: null,
  entryId: null,
  entryName: null,
  createdBy: null,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  archivedAt: null,
  archivedBy: null,
}

const directives = [
  {
    ...base,
    id: 'd1',
    scope: 'work',
    kind: 'style',
    text: '감정은 행동으로 보여 준다.',
    status: 'active',
  },
  {
    ...base,
    id: 'd2',
    scope: 'character',
    kind: 'speech',
    text: '서윤은 누구에게나 반말을 한다.',
    status: 'active',
    entryId: 'e1',
    entryName: '서윤',
    speechLevel: 'banmal',
  },
  {
    ...base,
    id: 'd3',
    scope: 'chapter',
    kind: 'ban',
    text: "'고개를 끄덕이다'는 쓰지 않는다.",
    status: 'active',
    chapterPosition: 3,
    pattern: '고개를 끄덕',
  },
  {
    ...base,
    id: 'd4',
    scope: 'work',
    kind: 'length',
    text: '짧게 쓴다.',
    status: 'off',
    targetChars: 3000,
  },
] as unknown as DirectiveItem[]

const characters = [
  { id: 'e1', name: '서윤', speech: '짧고 단정하다' },
  { id: 'e2', name: '도현', speech: null },
]

const styleCards = [{ name: '기본 문체', rules: '문장은 짧게 끊는다.' }]

beforeEach(() => {
  run.mockResolvedValue({ id: 'd9' } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DirectiveList', () => {
  it('renders the active requests with scope and kind badges', () => {
    render(
      <DirectiveList
        workId="w1"
        directives={directives}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    expect(screen.getByText('적용 중인 요청')).toBeInTheDocument()
    const work = screen.getByText('감정은 행동으로 보여 준다.').closest('li') as HTMLElement
    expect(within(work).getByText('작품 전체')).toBeInTheDocument()
    expect(within(work).getByText('문체')).toBeInTheDocument()
    const person = screen.getByText('서윤은 누구에게나 반말을 한다.').closest('li') as HTMLElement
    expect(within(person).getByText('인물 서윤')).toBeInTheDocument()
    expect(within(person).getByText('말투')).toBeInTheDocument()
    const chapter = screen
      .getByText("'고개를 끄덕이다'는 쓰지 않는다.")
      .closest('li') as HTMLElement
    expect(within(chapter).getByText('3화만')).toBeInTheDocument()
    expect(within(chapter).getByText('쓰지 않을 말')).toBeInTheDocument()
  })

  it('lists switched-off requests under their own heading with 켜기', () => {
    render(
      <DirectiveList
        workId="w1"
        directives={directives}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    expect(screen.getByText('꺼 둔 요청')).toBeInTheDocument()
    const off = screen.getByText('짧게 쓴다.').closest('li') as HTMLElement
    expect(within(off).getByText('분량')).toBeInTheDocument()
    expect(within(off).getByRole('button', { name: '켜기' })).toBeInTheDocument()
  })

  it('shows the empty message when no request is active', () => {
    render(<DirectiveList workId="w1" directives={[]} characters={[]} styleCards={[]} canEdit />)
    expect(
      screen.getByText('아직 요청이 없습니다. AI가 계속 지켜야 할 것을 적어 두세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('꺼 둔 요청')).not.toBeInTheDocument()
  })

  it('turns a request off with status off', async () => {
    update.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
    render(
      <DirectiveList
        workId="w1"
        directives={directives}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    const work = screen.getByText('감정은 행동으로 보여 준다.').closest('li') as HTMLElement
    fireEvent.click(within(work).getByRole('button', { name: '끄기' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ directiveId: 'd1', status: 'off' }))
  })

  it('sends the chosen scope, kind and fields when a request is added', async () => {
    create.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('예: 세린은 누구에게나 반말을 한다.'), {
      target: { value: '  밥을 먹지 않는다.  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '요청 추가' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        workId: 'w1',
        scope: 'work',
        kind: 'style',
        text: '밥을 먹지 않는다.',
        source: 'author',
      }),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('sends the chosen character when the scope is 인물', async () => {
    const user = userEvent.setup()
    create.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('예: 세린은 누구에게나 반말을 한다.'), {
      target: { value: '서윤은 존댓말을 쓴다.' },
    })
    await user.click(screen.getByRole('combobox', { name: '범위' }))
    await user.click(await screen.findByRole('option', { name: '인물' }))
    await user.click(screen.getByRole('combobox', { name: '인물' }))
    await user.click(await screen.findByRole('option', { name: '서윤' }))
    fireEvent.click(screen.getByRole('button', { name: '요청 추가' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'character',
        entryId: 'e1',
        chapterPosition: null,
      }),
    )
  })

  it('sends the chapter number when the scope is 한 회차만', async () => {
    const user = userEvent.setup()
    create.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('예: 세린은 누구에게나 반말을 한다.'), {
      target: { value: '이번 회차는 짧게 끊는다.' },
    })
    await user.click(screen.getByRole('combobox', { name: '범위' }))
    await user.click(await screen.findByRole('option', { name: '한 회차만' }))
    fireEvent.change(screen.getByLabelText('회차'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: '요청 추가' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'chapter',
        chapterPosition: 7,
        entryId: null,
      }),
    )
  })

  it('sends the chosen speech level when the kind is 말투', async () => {
    const user = userEvent.setup()
    create.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('예: 세린은 누구에게나 반말을 한다.'), {
      target: { value: '세린은 존댓말을 쓴다.' },
    })
    await user.click(screen.getByRole('combobox', { name: '종류' }))
    await user.click(await screen.findByRole('option', { name: '말투' }))
    await user.click(screen.getByRole('combobox', { name: '말투' }))
    await user.click(await screen.findByRole('option', { name: '존댓말' }))
    fireEvent.click(screen.getByRole('button', { name: '요청 추가' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'speech', speechLevel: 'jondaet', targetChars: null }),
    )
  })

  it('sends the target character count when the kind is 분량', async () => {
    const user = userEvent.setup()
    create.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('예: 세린은 누구에게나 반말을 한다.'), {
      target: { value: '한 회차는 3000자 안팎으로 쓴다.' },
    })
    await user.click(screen.getByRole('combobox', { name: '종류' }))
    await user.click(await screen.findByRole('option', { name: '분량' }))
    fireEvent.change(screen.getByLabelText('공백 포함 글자 수'), { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: '요청 추가' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'length', targetChars: 3000, speechLevel: null }),
    )
  })

  it('prefills the ban pattern from the text and sends the edited pattern', async () => {
    const user = userEvent.setup()
    create.mockReturnValue(Promise.resolve({ ok: true, data: {} }) as never)
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    await user.click(screen.getByRole('combobox', { name: '종류' }))
    await user.click(await screen.findByRole('option', { name: '쓰지 않을 말' }))
    fireEvent.change(screen.getByPlaceholderText('예: 세린은 누구에게나 반말을 한다.'), {
      target: { value: "'고개를 끄덕이다'는 쓰지 않는다." },
    })
    expect(screen.getByLabelText('찾을 말')).toHaveValue('고개를 끄덕')
    fireEvent.change(screen.getByLabelText('찾을 말'), { target: { value: '끄덕' } })
    fireEvent.click(screen.getByRole('button', { name: '요청 추가' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ban', pattern: '끄덕' }))
  })

  it('hides the edit controls from viewers', () => {
    render(
      <DirectiveList
        workId="w1"
        directives={directives}
        characters={characters}
        styleCards={styleCards}
        canEdit={false}
      />,
    )
    expect(screen.queryByRole('button', { name: '끄기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '보관' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '요청 추가' })).not.toBeInTheDocument()
    expect(screen.getByText('감정은 행동으로 보여 준다.')).toBeInTheDocument()
  })

  it('shows the read-only style rules and speech with a link to the style cards', () => {
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
      />,
    )
    expect(screen.getByText('함께 적용되는 문체와 말투')).toBeInTheDocument()
    expect(screen.getByText('기본 문체: 문장은 짧게 끊는다.')).toBeInTheDocument()
    expect(screen.getByText('서윤: 짧고 단정하다')).toBeInTheDocument()
    expect(screen.queryByText('도현:')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문체 카드 고치기' })).toHaveAttribute(
      'href',
      '/works/w1/wiki?tab=styles',
    )
  })
})
