// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFactAction } from '@/server/actions/wiki'
import type { FactView } from '@/server/facts'
import { FactList } from './fact-list'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createFactAction: vi.fn(),
  updateFactAction: vi.fn(),
  archiveFactAction: vi.fn(),
  supersedeFactAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

const chapter = { id: 'c3', position: 3, title: '재회', archived: false }

function fact(overrides: Partial<FactView>): FactView {
  return {
    id: 'f1',
    workId: 'w1',
    entryId: 'e1',
    subjectName: '서윤',
    content: '서윤은 검을 쓴다',
    status: 'confirmed',
    sourceType: 'chapter',
    sourceChapterId: 'c3',
    evidence: '검을 뽑았다',
    validFromPosition: null,
    validToPosition: null,
    revealAtPosition: null,
    supersededByFactId: null,
    createdByType: 'author',
    archivedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    sourceChapter: chapter,
    supersededBy: null,
    ...overrides,
  }
}

const chapters = [chapter, { id: 'c12', position: 12, title: '', archived: false }]

describe('FactList', () => {
  it('shows the status tag, content, source and evidence', () => {
    render(
      <FactList
        workId="w1"
        entryId="e1"
        facts={[fact({ status: 'assumed', content: '서윤은 활을 쓴다' })]}
        chapters={chapters}
        canEdit
      />,
    )
    expect(screen.getByText('[가정]')).toBeInTheDocument()
    expect(screen.getByText('서윤은 활을 쓴다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '3화 재회' })).toHaveAttribute(
      'href',
      '/works/w1/chapters/c3',
    )
    expect(screen.getByText('검을 뽑았다')).toBeInTheDocument()
  })

  it('shows validity ranges as N화부터 and ~M화', () => {
    render(
      <FactList
        workId="w1"
        entryId="e1"
        facts={[fact({ validFromPosition: 12, validToPosition: 20 })]}
        chapters={chapters}
        canEdit
      />,
    )
    expect(screen.getByText('12화부터 ~20화')).toBeInTheDocument()
  })

  it('dims a superseded fact and links to the fact that replaced it', () => {
    const newer = fact({ id: 'f2', content: '서윤은 활을 쓴다', validFromPosition: 12 })
    render(
      <FactList
        workId="w1"
        entryId="e1"
        facts={[
          fact({
            id: 'f1',
            validToPosition: 11,
            supersededByFactId: 'f2',
            supersededBy: { id: 'f2', content: newer.content, validFromPosition: 12 },
          }),
          newer,
        ]}
        chapters={chapters}
        canEdit
      />,
    )
    expect(screen.getByText('(12화부터 바뀜)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '새 사실 보기' })).toHaveAttribute('href', '#fact-f2')
  })

  it('shows add and edit controls to editors', () => {
    render(<FactList workId="w1" entryId="e1" facts={[fact({})]} chapters={chapters} canEdit />)
    expect(screen.getByRole('button', { name: '사실 추가' })).toBeInTheDocument()
    const row = screen.getByText('서윤은 검을 쓴다').closest('li') as HTMLElement
    expect(within(row).getByRole('button', { name: '내용 수정' })).toBeInTheDocument()
  })

  it('hides write controls from viewers', () => {
    render(
      <FactList workId="w1" entryId="e1" facts={[fact({})]} chapters={chapters} canEdit={false} />,
    )
    expect(screen.queryByRole('button', { name: '사실 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '내용 수정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '보관' })).not.toBeInTheDocument()
  })

  it('adds a fact to the card with the default confirmed tag and no chapter', async () => {
    render(<FactList workId="w1" entryId="e1" facts={[]} chapters={chapters} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: '사실 추가' }))
    fireEvent.change(screen.getByLabelText('사실 내용'), {
      target: { value: '서윤은 밤에만 검을 든다' },
    })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(createFactAction).toHaveBeenCalledTimes(1))
    expect(createFactAction).toHaveBeenCalledWith({
      workId: 'w1',
      entryId: 'e1',
      content: '서윤은 밤에만 검을 든다',
      status: 'confirmed',
      sourceType: 'author',
      sourceChapterId: null,
      evidence: '',
    })
  })
})
