// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRelationAction, updateRelationAction } from '@/server/actions/relations'
import type { GraphEdge, GraphNode } from './graph-model'
import { RelationForm } from './relation-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/server/actions/relations', () => ({
  createRelationAction: vi.fn(),
  updateRelationAction: vi.fn(),
  archiveRelationAction: vi.fn(),
}))

const create = vi.mocked(createRelationAction)
const update = vi.mocked(updateRelationAction)

const nodes: GraphNode[] = [
  { id: 'a', name: '서윤', kind: 'character', firstAppearance: 1 },
  { id: 'b', name: '도현', kind: 'character', firstAppearance: 2 },
]

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('RelationForm', () => {
  it('fills the relation kind from a suggestion chip', () => {
    render(<RelationForm workId="w1" nodes={nodes} onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '가족' }))
    expect(screen.getByLabelText('관계 종류')).toHaveValue('가족')
  })

  it('asks for the range and direction with visible labels', () => {
    render(<RelationForm workId="w1" nodes={nodes} onDone={() => {}} />)
    expect(screen.getByLabelText('시작 회차')).toBeInTheDocument()
    expect(screen.getByLabelText('끝 회차')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '방향 있음' })).toBeInTheDocument()
    expect(screen.getByLabelText('설명')).toBeInTheDocument()
  })

  it('updates an existing relation with its id and the edited values', async () => {
    update.mockResolvedValue({ ok: true, data: {} as never })
    const relation: GraphEdge = {
      id: 'r1',
      source: 'a',
      target: 'b',
      kind: '동료',
      description: '같은 길드',
      directed: false,
      startPosition: 3,
      endPosition: null,
    }
    render(<RelationForm workId="w1" nodes={nodes} relation={relation} onDone={() => {}} />)
    expect(screen.getByLabelText('관계 종류')).toHaveValue('동료')
    expect(screen.getByLabelText('시작 회차')).toHaveValue(3)

    fireEvent.change(screen.getByLabelText('관계 종류'), { target: { value: '적대' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith({
      relationId: 'r1',
      sourceEntryId: 'a',
      targetEntryId: 'b',
      kind: '적대',
      description: '같은 길드',
      directed: false,
      startPosition: 3,
      endPosition: null,
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('creates a new relation between the two chosen cards', async () => {
    create.mockResolvedValue({ ok: true, data: {} as never })
    render(
      <RelationForm
        workId="w1"
        nodes={nodes}
        defaultSourceId="a"
        defaultTargetId="b"
        onDone={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '친구' }))
    fireEvent.click(screen.getByRole('button', { name: '관계 추가' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({
      workId: 'w1',
      sourceEntryId: 'a',
      targetEntryId: 'b',
      kind: '친구',
      description: '',
      directed: false,
      startPosition: null,
      endPosition: null,
    })
  })
})
