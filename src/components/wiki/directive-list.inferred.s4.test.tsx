// @vitest-environment jsdom
// Task 3: inferred proposals in the ledger tab.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { decideInferredAction } from '@/server/actions/wiki'
import { DirectiveList } from './directive-list'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createDirectiveAction: vi.fn(),
  updateDirectiveAction: vi.fn(),
  archiveDirectiveAction: vi.fn(),
  decideInferredAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const decide = vi.mocked(decideInferredAction)
const run = vi.mocked(runAction)

const characters = [{ id: 'e1', name: '세린', speech: null }]
const styleCards: { name: string; rules: string }[] = []

const inferred = [
  {
    runId: 'run-1',
    index: 0,
    text: "'입꼬리'는 쓰지 않는다",
    kind: 'ban' as const,
    entryId: null,
    entryName: null,
    pattern: '입꼬리',
  },
  {
    runId: 'run-1',
    index: 1,
    text: '세린은 반말을 쓴다',
    kind: 'speech' as const,
    entryId: 'e1',
    entryName: '세린',
    pattern: null,
  },
]

beforeEach(() => {
  run.mockResolvedValue({ ok: true } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DirectiveList inferred proposals (s4)', () => {
  it('renders the inferred section above the active list with hint and badges', () => {
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
        inferred={inferred}
      />,
    )
    expect(screen.getByText('수정에서 찾은 요청')).toBeInTheDocument()
    expect(
      screen.getByText('작가님이 고친 곳을 보고 찾은 것입니다. 추가해야 적용됩니다.'),
    ).toBeInTheDocument()
    // Above the active list.
    const inferredHeading = screen.getByText('수정에서 찾은 요청')
    const activeHeading = screen.getByText('적용 중인 요청')
    expect(
      inferredHeading.compareDocumentPosition(activeHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // Per proposal text and scope badges.
    expect(screen.getByText("'입꼬리'는 쓰지 않는다")).toBeInTheDocument()
    expect(screen.getByText('세린은 반말을 쓴다')).toBeInTheDocument()
    const first = screen.getByText("'입꼬리'는 쓰지 않는다").closest('li') as HTMLElement
    expect(within(first).getByText('작품 전체')).toBeInTheDocument()
    const second = screen.getByText('세린은 반말을 쓴다').closest('li') as HTMLElement
    expect(within(second).getByText('인물 세린')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '무시' })).toHaveLength(2)
  })

  it('hides the inferred section when there are no proposals', () => {
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
        inferred={[]}
      />,
    )
    expect(screen.queryByText('수정에서 찾은 요청')).not.toBeInTheDocument()
  })

  it('calls decideInferredAction with add and moves the row to the active list', async () => {
    decide.mockResolvedValue({ ok: true, data: { directiveId: 'd-new' } } as never)
    run.mockImplementation((p: unknown) => p as never)
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
        inferred={inferred}
      />,
    )
    const first = screen.getByText("'입꼬리'는 쓰지 않는다").closest('li') as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: '추가' }))
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        workId: 'w1',
        runId: 'run-1',
        index: 0,
        decision: 'add',
      }),
    )
    await waitFor(() => {
      // The row leaves the inferred section and joins the active list.
      expect(screen.queryByText('수정에서 찾은 요청')).toBeInTheDocument()
      const active = screen.getByText('적용 중인 요청').closest('section') as HTMLElement
      expect(within(active).getByText("'입꼬리'는 쓰지 않는다")).toBeInTheDocument()
    })
  })

  it('calls decideInferredAction with ignore and removes the row', async () => {
    decide.mockResolvedValue({ ok: true, data: {} } as never)
    run.mockImplementation((p: unknown) => p as never)
    render(
      <DirectiveList
        workId="w1"
        directives={[]}
        characters={characters}
        styleCards={styleCards}
        canEdit
        inferred={inferred}
      />,
    )
    const second = screen.getByText('세린은 반말을 쓴다').closest('li') as HTMLElement
    fireEvent.click(within(second).getByRole('button', { name: '무시' }))
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        workId: 'w1',
        runId: 'run-1',
        index: 1,
        decision: 'ignore',
      }),
    )
    await waitFor(() => expect(screen.queryByText('세린은 반말을 쓴다')).not.toBeInTheDocument())
  })
})
