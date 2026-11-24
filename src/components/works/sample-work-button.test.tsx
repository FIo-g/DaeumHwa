// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SampleWorkButton } from './sample-work-button'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/server/actions/sample-work', () => ({
  createSampleWorkAction: vi.fn(),
}))

import { createSampleWorkAction } from '@/server/actions/sample-work'

const createAction = vi.mocked(createSampleWorkAction)

beforeEach(() => {
  vi.clearAllMocks()
  push.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('SampleWorkButton', () => {
  it('creates the sample work and opens chapter 3 with demo=1', async () => {
    createAction.mockResolvedValue({
      ok: true,
      data: { workId: 'w1', chapterId: 'c3' },
    })
    render(<SampleWorkButton />)

    fireEvent.click(screen.getByRole('button', { name: '샘플 작품으로 체험하기' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/works/w1/chapters/c3?demo=1'))
    expect(screen.getByRole('button', { name: '만드는 중…' })).toBeDisabled()
  })

  it('lets the author retry after a failed action', async () => {
    createAction.mockResolvedValue({
      ok: false,
      error: { code: 'BAD_STATE', message: '샘플 작품을 만들지 못했어요.' },
    })
    render(<SampleWorkButton />)

    fireEvent.click(screen.getByRole('button', { name: '샘플 작품으로 체험하기' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '샘플 작품으로 체험하기' })).toBeEnabled(),
    )
    expect(push).not.toHaveBeenCalled()
  })
})
