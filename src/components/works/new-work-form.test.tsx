// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { NewWorkForm } from './new-work-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/server/actions/works', () => ({
  createWorkAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('NewWorkForm', () => {
  it('asks for a title and a short introduction', () => {
    render(<NewWorkForm />)
    expect(screen.getByLabelText('제목')).toBeInTheDocument()
    expect(screen.getByLabelText('장르')).toBeInTheDocument()
    expect(screen.getByLabelText('한 줄 소개')).toBeInTheDocument()
  })

  it('creates the work and then offers the three ways to start', async () => {
    run.mockResolvedValue({ id: 'w1', title: '별빛 계약' } as never)
    render(<NewWorkForm />)
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '별빛 계약' } })
    fireEvent.click(screen.getByRole('button', { name: '작품 만들기' }))

    await waitFor(() =>
      expect(screen.getByRole('link', { name: '인터뷰로 설정 정리하기' })).toHaveAttribute(
        'href',
        '/works/w1/interview',
      ),
    )
    expect(screen.getByRole('link', { name: '기존 원고 가져오기' })).toHaveAttribute(
      'href',
      '/works/w1/import',
    )
    expect(screen.getByRole('link', { name: '바로 쓰기' })).toHaveAttribute(
      'href',
      '/works/w1/write',
    )
  })

  it('keeps the form and shows no choices when creation fails', async () => {
    run.mockResolvedValue(null)
    render(<NewWorkForm />)
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '별빛 계약' } })
    fireEvent.click(screen.getByRole('button', { name: '작품 만들기' }))

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('link', { name: '바로 쓰기' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('제목')).toBeInTheDocument()
  })
})
