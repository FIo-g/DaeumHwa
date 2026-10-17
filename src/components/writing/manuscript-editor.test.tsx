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

  it('keeps highlights frozen while composing and applies them after compositionend', () => {
    const first: Highlight[] = [{ id: 'a', start: 0, end: 2, kind: 'issue' }]
    const second: Highlight[] = [{ id: 'b', start: 5, end: 7, kind: 'issue' }]
    const { rerender, props } = renderEditor({ highlights: first })

    const marksBefore = Array.from(document.querySelectorAll('mark')).map((m) => m.textContent)
    expect(marksBefore).toEqual(['가나'])

    fireEvent.compositionStart(bodyBox())
    // The author keeps typing inside the composition: the body changes, highlights change too.
    fireEvent.change(bodyBox(), { target: { value: '가나다라마바사ㅇ' } })
    expect(props.onBodyChange).toHaveBeenCalledWith('가나다라마바사ㅇ')
    rerender(<ManuscriptEditor {...props} body="가나다라마바사ㅇ" highlights={second} />)

    // Highlight layer must not have been recomputed yet.
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

  it('keeps the window scroll position when the textarea is re-measured', () => {
    // Browser clamp: collapsing the textarea to height auto shortens the page for one layout
    // pass, and reading scrollHeight at that moment resets window.scrollY to 0.
    let scrollPos = 1234
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollPos })
    const scrollTo = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation((options?: ScrollToOptions | number) => {
        if (typeof options === 'object' && options.top !== undefined) scrollPos = options.top
      })

    try {
      const { rerender, props } = renderEditor({ body: '가나다' })
      scrollTo.mockClear()
      scrollPos = 1234

      const el = bodyBox()
      Object.defineProperty(el, 'scrollHeight', {
        configurable: true,
        get() {
          scrollPos = 0
          return 400
        },
      })

      rerender(<ManuscriptEditor {...props} body="가나다라마바사" />)

      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1234 }))
      expect(scrollPos).toBe(1234)
    } finally {
      scrollTo.mockRestore()
      if (originalScrollY) Object.defineProperty(window, 'scrollY', originalScrollY)
      else delete (window as unknown as Record<string, unknown>).scrollY
    }
  })
})
