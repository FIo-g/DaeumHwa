// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { markSampleChapter } from '@/lib/client/sample-session'
import { SampleBanner } from './sample-banner'

const chapters = [
  { id: 'c1', position: 1 },
  { id: 'c2', position: 2 },
  { id: 'c3', position: 3 },
]

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('SampleBanner', () => {
  it('guides from chapter 3 to chapter 2 when the demo query is present', () => {
    render(<SampleBanner demo workId="w1" chapterId="c3" chapterPosition={3} chapters={chapters} />)

    expect(screen.getByText('샘플 작품', { exact: true })).toBeInTheDocument()
    expect(screen.getByText(/설정 오류를 세 군데 숨겨 뒀어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '2화 점검하기' })).toHaveAttribute(
      'href',
      '/works/w1/chapters/c2?demo=1',
    )
    expect(screen.getByRole('link', { name: '설정 보드 보기' })).toHaveAttribute(
      'href',
      '/works/w1/wiki',
    )
  })

  it('guides from chapter 2 to chapter 3', () => {
    render(<SampleBanner demo workId="w1" chapterId="c2" chapterPosition={2} chapters={chapters} />)

    expect(screen.getByRole('link', { name: '3화 점검하기' })).toHaveAttribute(
      'href',
      '/works/w1/chapters/c3?demo=1',
    )
  })

  it('renders nothing when neither the demo query nor the session flag is set', () => {
    const { container } = render(
      <SampleBanner
        demo={false}
        workId="w1"
        chapterId="c3"
        chapterPosition={3}
        chapters={chapters}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('stays visible after the demo query drops when the tab is marked as a sample', () => {
    markSampleChapter('c3')
    render(
      <SampleBanner
        demo={false}
        workId="w1"
        chapterId="c3"
        chapterPosition={3}
        chapters={chapters}
      />,
    )

    expect(screen.getByText('샘플 작품', { exact: true })).toBeInTheDocument()
  })
})
