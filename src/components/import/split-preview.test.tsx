// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SplitPreview } from './split-preview'

const initial = [
  { title: '1화', body: '첫 번째 회차\n본문 하나', startLine: 0 },
  { title: '2화', body: '두 번째 회차 본문', startLine: 3 },
  { title: '3화', body: '세 번째', startLine: 6 },
]

afterEach(() => {
  cleanup()
})

describe('SplitPreview', () => {
  it('renders each chapter with its title, character count and first line', () => {
    render(
      <SplitPreview method="headings" initial={initial} onBack={() => {}} onConfirm={() => {}} />,
    )

    expect(screen.getByLabelText('1번째 회차 제목')).toHaveValue('1화')
    expect(screen.getByLabelText('3번째 회차 제목')).toHaveValue('3화')
    // "첫 번째 회차" (7) + "본문 하나" (5), line break not counted
    expect(screen.getByText('12자')).toBeInTheDocument()
    expect(screen.getByText('첫 번째 회차')).toBeInTheDocument()
    expect(
      screen.getByText('3화를 가져옵니다. 회차마다 AI 호출이 1번씩 일어납니다.'),
    ).toBeInTheDocument()
  })

  it('merges a chapter into the previous one with 앞 회차와 합치기', () => {
    const onConfirm = vi.fn()
    render(
      <SplitPreview method="headings" initial={initial} onBack={() => {}} onConfirm={onConfirm} />,
    )

    // The first chapter has no previous one, so its merge button is disabled.
    expect(screen.getAllByRole('button', { name: '앞 회차와 합치기' })[0]).toBeDisabled()
    fireEvent.click(screen.getAllByRole('button', { name: '앞 회차와 합치기' })[1])

    expect(
      screen.getByText('2화를 가져옵니다. 회차마다 AI 호출이 1번씩 일어납니다.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '이대로 가져오기' }))

    const chapters = onConfirm.mock.calls[0][0]
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('1화')
    expect(chapters[0].body).toContain('첫 번째 회차')
    expect(chapters[0].body).toContain('두 번째 회차 본문')
  })

  it('removes an excluded chapter from the upload list', () => {
    const onConfirm = vi.fn()
    render(
      <SplitPreview method="headings" initial={initial} onBack={() => {}} onConfirm={onConfirm} />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: '제외' })[0])

    expect(screen.getByLabelText('1번째 회차 제목')).toHaveValue('2화')
    expect(screen.queryByLabelText('3번째 회차 제목')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '이대로 가져오기' }))
    expect(onConfirm.mock.calls[0][0].map((c: { title: string }) => c.title)).toEqual([
      '2화',
      '3화',
    ])
  })

  it('updates a chapter title when it is edited', () => {
    const onConfirm = vi.fn()
    render(
      <SplitPreview method="headings" initial={initial} onBack={() => {}} onConfirm={onConfirm} />,
    )

    fireEvent.change(screen.getByLabelText('2번째 회차 제목'), {
      target: { value: '두 번째 만남' },
    })

    expect(screen.getByLabelText('2번째 회차 제목')).toHaveValue('두 번째 만남')
    fireEvent.click(screen.getByRole('button', { name: '이대로 가져오기' }))
    expect(onConfirm.mock.calls[0][0][1].title).toBe('두 번째 만남')
  })

  it('disables the upload button when every chapter is excluded', () => {
    render(
      <SplitPreview
        method="single"
        initial={[{ title: '1화', body: '내용', startLine: 0 }]}
        onBack={() => {}}
        onConfirm={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '제외' }))

    expect(screen.getByRole('button', { name: '이대로 가져오기' })).toBeDisabled()
  })
})
