// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManuscriptEditor, type ManuscriptEditorProps } from './manuscript-editor'
import type { Highlight } from './types'

function renderEditor(overrides: Partial<ManuscriptEditorProps> = {}) {
  const props: ManuscriptEditorProps = {
    title: '1화',
    body: '가나다라마바사',
    onTitleChange: vi.fn(),
    onBodyChange: vi.fn(),
    onComposingChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onCursorChange: vi.fn(),
    highlights: [],
    readOnly: false,
    targetChars: 5500,
    textareaRef: createRef<HTMLTextAreaElement>(),
    ...overrides,
  }
  const view = render(<ManuscriptEditor {...props} />)
  return { ...view, props }
}

function bodyBox(): HTMLTextAreaElement {
  return screen.getByLabelText('원고 본문') as HTMLTextAreaElement
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('ManuscriptEditor', () => {
  it('labels each finding link as a number and hides the links while rechecking', () => {
    const onShowIssue = vi.fn()
    const { rerender, props } = renderEditor({
      highlights: [{ id: 'issue', start: 0, end: 2, kind: 'issue', order: 0 }],
      onShowIssue,
    })
    expect(screen.getByRole('group', { name: '원고의 지적 번호' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '지적 1번 보기' }))
    expect(onShowIssue).toHaveBeenCalledWith('issue')
    rerender(
      <ManuscriptEditor {...props} check={{ checking: true, resultKey: 0, issueCount: 1 }} />,
    )
    expect(screen.queryByRole('button', { name: '지적 1번 보기' })).toBeNull()
  })

  it('reports typed text through onBodyChange', () => {
    const { props } = renderEditor()
    fireEvent.change(bodyBox(), { target: { value: '가나다라마바사아' } })
    expect(props.onBodyChange).toHaveBeenCalledWith('가나다라마바사아')
  })

  it('reports title edits through onTitleChange', () => {
    const { props } = renderEditor()
    fireEvent.change(screen.getByLabelText('회차 제목'), { target: { value: '2화' } })
    expect(props.onTitleChange).toHaveBeenCalledWith('2화')
  })

  it('reports IME composition start and end', () => {
    const { props } = renderEditor()
    fireEvent.compositionStart(bodyBox())
    expect(props.onComposingChange).toHaveBeenLastCalledWith(true)
    fireEvent.compositionEnd(bodyBox())
    expect(props.onComposingChange).toHaveBeenLastCalledWith(false)
  })

  it('keeps the previous findings while composing and applies new ones after compositionend', () => {
    const first: Highlight[] = [{ id: 'a', start: 0, end: 2, kind: 'issue' }]
    const second: Highlight[] = [{ id: 'b', start: 5, end: 7, kind: 'issue' }]
    const { rerender, props } = renderEditor({ highlights: first })

    const marksBefore = Array.from(document.querySelectorAll('mark')).map((m) => m.textContent)
    expect(marksBefore).toEqual(['가나'])

    bodyBox().setSelectionRange(props.body.length, props.body.length)
    fireEvent.compositionStart(bodyBox())
    // The author keeps typing inside the composition: the body changes, highlights change too.
    fireEvent.change(bodyBox(), { target: { value: '가나다라마바사ㅇ' } })
    expect(props.onBodyChange).toHaveBeenCalledWith('가나다라마바사ㅇ')
    rerender(<ManuscriptEditor {...props} body="가나다라마바사ㅇ" highlights={second} />)

    // The previous finding remains visible until composition ends.
    expect(Array.from(document.querySelectorAll('mark')).map((m) => m.textContent)).toEqual([
      '가나',
    ])

    fireEvent.compositionEnd(bodyBox())
    expect(Array.from(document.querySelectorAll('mark')).map((m) => m.textContent)).toEqual([
      '바사',
    ])
  })

  it('renders highlights as marks with their kind', () => {
    renderEditor({
      body: '서윤은 웃었다',
      highlights: [{ id: 'h1', start: 0, end: 2, kind: 'issue' }],
    })
    const mark = document.querySelector('mark[data-kind="issue"]')
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe('서윤')
  })

  it('shows the counts with and without spaces and the target percentage', () => {
    renderEditor({ body: '가 나\n다', targetChars: 10 })
    expect(screen.getByText(/공백 포함 4자/)).toBeInTheDocument()
    expect(screen.getByText(/제외 3자/)).toBeInTheDocument()
    expect(screen.getByText(/목표 대비 40%/)).toBeInTheDocument()
  })

  it('disables editing when readOnly', () => {
    renderEditor({ readOnly: true })
    expect(bodyBox()).toHaveAttribute('readonly')
    expect(screen.getByLabelText('회차 제목')).toHaveAttribute('readonly')
  })

  it('shares the text layout and keeps a final empty row in the sizing mirror', () => {
    const { rerender, props } = renderEditor({ body: '첫 줄' })
    const mirror = document.querySelector('.wg-writing-mirror')
    expect(bodyBox()).toHaveClass('wg-writing-text')
    expect(mirror).toHaveClass('wg-writing-text')

    rerender(<ManuscriptEditor {...props} body={'첫 줄\n'} />)

    expect(mirror?.textContent).toBe('첫 줄\n\u200b')
    expect(bodyBox().value).toBe('첫 줄\n')
    expect(bodyBox().style.height).toBe('')
  })

  it('follows a highlighted phrase after the composing character changes its offset', () => {
    const highlight: Highlight = { id: 'a', start: 1, end: 3, kind: 'issue' }
    const { rerender, props } = renderEditor({ body: '가나다', highlights: [highlight] })
    bodyBox().setSelectionRange(0, 0)
    fireEvent.compositionStart(bodyBox())
    rerender(<ManuscriptEditor {...props} body="ㅎ가나다" />)

    expect(document.querySelector('mark')).toHaveTextContent('나다')
    expect(document.querySelector('.wg-writing-mirror')).toHaveTextContent('ㅎ가나다')
  })

  it('pauses a highlight when composition replaces part of the highlighted phrase', () => {
    const highlight: Highlight = { id: 'a', start: 0, end: 2, kind: 'issue' }
    const { rerender, props } = renderEditor({ body: '가나다', highlights: [highlight] })
    bodyBox().setSelectionRange(1, 2)
    fireEvent.compositionStart(bodyBox())
    rerender(<ManuscriptEditor {...props} body="가ㅎ다" />)

    expect(document.querySelector('mark')).toBeNull()
  })
})
