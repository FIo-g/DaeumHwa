// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChangeDiff } from './change-diff'

afterEach(() => {
  cleanup()
})

describe('ChangeDiff', () => {
  it('shows only the changed fields as before and after values', () => {
    render(
      <ChangeDiff
        targetTable="facts"
        before={{
          id: 'f-1',
          workId: 'w-1',
          content: '검을 쓴다',
          status: 'assumed',
          updatedAt: '2026-10-16T00:00:00Z',
        }}
        after={{
          id: 'f-1',
          workId: 'w-1',
          content: '검을 쓴다',
          status: 'confirmed',
          updatedAt: '2026-10-16T01:00:00Z',
        }}
      />,
    )
    expect(screen.getByText('태그')).toBeInTheDocument()
    expect(screen.getByText('가정')).toBeInTheDocument()
    expect(screen.getByText('확정')).toBeInTheDocument()
    expect(screen.queryByText('검을 쓴다')).not.toBeInTheDocument()
    expect(screen.queryByText('f-1')).not.toBeInTheDocument()
  })

  it('shows 없음 for the missing side of a create', () => {
    render(
      <ChangeDiff
        targetTable="wiki_entries"
        before={null}
        after={{ id: 'e-1', name: '서윤', kind: 'character', archivedAt: null }}
      />,
    )
    expect(screen.getByText('서윤')).toBeInTheDocument()
    expect(screen.getByText('인물')).toBeInTheDocument()
    expect(screen.getAllByText('없음').length).toBeGreaterThan(0)
  })

  it('says nothing changed when the snapshots match', () => {
    render(
      <ChangeDiff targetTable="threads" before={{ title: '열쇠' }} after={{ title: '열쇠' }} />,
    )
    expect(screen.getByText('바뀐 내용이 없어요.')).toBeInTheDocument()
  })

  it('labels authorship and importance and skips system and unrecognized keys', () => {
    const { container } = render(
      <ChangeDiff
        targetTable="threads"
        before={{ createdByType: 'author', importance: 'low' }}
        after={{
          createdByType: 'ai',
          importance: 'high',
          relatedEntryIds: ['internal-reference'],
          threadHash: 'internal-hash',
          reopenedPredecessor: { id: 'internal-predecessor' },
          newField: 'internal-new-field',
        }}
      />,
    )
    expect(container.querySelectorAll('dt')).toHaveLength(2)
    for (const label of ['작성 주체', '작가', 'AI', '중요도', '낮음', '높음']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(container.textContent).not.toMatch(/(?:internal|createdByType|author|low|high)/)
  })

  it('localizes known fact codes and does not print new codes literally', () => {
    render(
      <ChangeDiff
        targetTable="facts"
        before={{ sourceType: 'chapter' }}
        after={{ sourceType: 'unrecognized_source', subjectName: '한세린' }}
      />,
    )
    for (const label of ['출처', '회차', '알 수 없음', '대상 이름', '한세린']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('unrecognized_source')).not.toBeInTheDocument()
  })

  it('labels fixed properties and preserves text written by the author', () => {
    render(
      <ChangeDiff
        targetTable="wiki_entries"
        before={null}
        after={{
          fields: { age: '16살', hiddenFlag: 'internal-value' },
          customFields: [{ key: 'Magic', value: '어머니의 편지' }],
        }}
      />,
    )
    expect(screen.getByText('나이: 16살')).toBeInTheDocument()
    expect(screen.getByText('Magic: 어머니의 편지')).toBeInTheDocument()
    expect(screen.queryByText(/hiddenFlag|internal-value/)).not.toBeInTheDocument()
  })
})
