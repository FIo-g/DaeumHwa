// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChapterPicker } from './chapter-picker'

const chapters = [
  { id: 'c1', position: 1, title: '시작' },
  { id: 'c2', position: 2, title: '' },
]

afterEach(() => {
  cleanup()
})

describe('ChapterPicker', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(
      <ChapterPicker
        chapters={chapters}
        value={null}
        onChange={() => {}}
        placeholder="회차를 고르세요"
      />,
    )
    expect(screen.getByRole('combobox')).toHaveTextContent('회차를 고르세요')
  })

  it('shows the chapter label of the selected chapter', () => {
    render(<ChapterPicker chapters={chapters} value="c2" onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('2화')
  })

  it('forwards id and ariaLabel to the trigger', () => {
    render(
      <ChapterPicker
        chapters={chapters}
        value={null}
        onChange={() => {}}
        id="thread-chapter"
        ariaLabel="심은 회차"
      />,
    )
    const trigger = screen.getByRole('combobox', { name: '심은 회차' })
    expect(trigger.id).toBe('thread-chapter')
  })
})
