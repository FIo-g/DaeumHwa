// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { createEntryAction, updateEntryAction } from '@/server/actions/wiki'
import { EntryFormDialog } from './entry-form'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const create = vi.mocked(createEntryAction)
const update = vi.mocked(updateEntryAction)

beforeEach(() => {
  run.mockResolvedValue({ id: 'e1' } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EntryFormDialog', () => {
  it('creates a character with trimmed name, split aliases and the speech field', async () => {
    render(
      <EntryFormDialog
        workId="w1"
        mode="create"
        kinds={['character']}
        defaultKind="character"
        triggerLabel="새 인물"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '새 인물' }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: ' 서윤 ' } })
    fireEvent.change(screen.getByLabelText('별칭 (쉼표로 구분)'), {
      target: { value: '서윤이, 윤, ' },
    })
    fireEvent.change(screen.getByLabelText('말투'), { target: { value: '짧고 단정하다' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({
      workId: 'w1',
      kind: 'character',
      name: '서윤',
      aliases: ['서윤이', '윤'],
      summary: '',
      body: '',
      fields: { speech: '짧고 단정하다' },
      customFields: [],
      contextTier: 'mention',
    })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('prefills an existing entry and saves through updateEntryAction', async () => {
    render(
      <EntryFormDialog
        workId="w1"
        mode="edit"
        kinds={['character', 'place']}
        defaultKind="character"
        triggerLabel="수정"
        entry={{
          id: 'e1',
          kind: 'character',
          name: '서윤',
          aliases: ['윤'],
          summary: '주인공',
          body: '',
          fields: { role: '주인공' },
          customFields: [{ key: '별명', value: '검은 까마귀' }],
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    expect(screen.getByLabelText('이름')).toHaveValue('서윤')
    expect(screen.getByLabelText('역할')).toHaveValue('주인공')
    expect(screen.getByLabelText('자유 필드 이름 1')).toHaveValue('별명')

    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'e1',
        name: '서윤',
        customFields: [{ key: '별명', value: '검은 까마귀' }],
      }),
    )
  })
})
