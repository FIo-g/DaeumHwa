// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorToolbar, type EditorToolbarProps, SAVE_STATUS_TEXT } from './editor-toolbar'

const chapters = [
  { id: 'c1', position: 1, title: '시작' },
  { id: 'c2', position: 2, title: '' },
]

function renderToolbar(overrides: Partial<EditorToolbarProps> = {}) {
  const props: EditorToolbarProps = {
    workId: 'w1',
    chapterId: 'c2',
    chapters,
    status: 'saved',
    canEdit: true,
    chapterStatus: 'draft',
    onSaveNow: vi.fn(),
    onStatusChange: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
  }
  return render(<EditorToolbar {...props} />)
}

afterEach(() => {
  cleanup()
})

describe('EditorToolbar', () => {
  it('states the save result in Korean for each autosave status', () => {
    renderToolbar({ status: 'offline' })
    expect(screen.getByRole('status')).toHaveTextContent('오프라인: 이 기기에 임시 저장됨')
    expect(SAVE_STATUS_TEXT.conflict).toBe('충돌')
    expect(SAVE_STATUS_TEXT.dirty).toBe('저장 안 됨')
  })

  it('offers saving and the chapter status toggle to editors', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '초안' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '완료' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('hides write controls from read-only members', () => {
    renderToolbar({ canEdit: false })
    expect(screen.getByRole('status')).toHaveTextContent('보기 전용')
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '회차 상태' })).not.toBeInTheDocument()
  })

  it('always links to the version history', () => {
    renderToolbar({ canEdit: false })
    expect(screen.getByRole('link', { name: '버전 이력' })).toHaveAttribute(
      'href',
      '/works/w1/chapters/c2/history',
    )
  })
})
