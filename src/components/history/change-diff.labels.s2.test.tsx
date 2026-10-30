// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChangeDiff } from './change-diff'

afterEach(() => {
  cleanup()
})

const directiveBase = {
  id: 'd-1',
  workId: 'w-1',
  entryId: null,
  chapterPosition: null,
  pattern: null,
  speechLevel: null,
  targetChars: null,
  archivedAt: null,
  archivedBy: null,
  updatedAt: '2026-10-20T00:00:00Z',
  createdAt: '2026-10-20T00:00:00Z',
}

describe('ChangeDiff labels for the author request ledger', () => {
  it('shows Korean field names and values for a created request, and skips the creator id', () => {
    render(
      <ChangeDiff
        targetTable="author_directives"
        before={null}
        after={{
          ...directiveBase,
          scope: 'work',
          kind: 'content',
          text: '세린은 반말을 한다',
          source: 'suggested',
          status: 'active',
          createdBy: 'user-abc',
        }}
      />,
    )
    expect(screen.getByText('범위')).toBeTruthy()
    expect(screen.getByText('작품 전체')).toBeTruthy()
    expect(screen.getByText('요청')).toBeTruthy()
    expect(screen.getByText('세린은 반말을 한다')).toBeTruthy()
    expect(screen.getByText('종류')).toBeTruthy()
    expect(screen.getByText('내용')).toBeTruthy()
    expect(screen.getByText('출처')).toBeTruthy()
    expect(screen.getByText('AI 제안')).toBeTruthy()
    expect(screen.getByText('적용 중')).toBeTruthy()
    expect(screen.queryByText('user-abc')).toBeNull()
    expect(screen.queryByText('createdBy')).toBeNull()
    expect(screen.queryByText('scope')).toBeNull()
    expect(screen.queryByText('suggested')).toBeNull()
  })

  it('shows the switched-off status in Korean on a toggle', () => {
    render(
      <ChangeDiff
        targetTable="author_directives"
        before={{
          ...directiveBase,
          scope: 'work',
          kind: 'style',
          text: '문장을 짧게',
          source: 'author',
          status: 'active',
          createdBy: null,
        }}
        after={{
          ...directiveBase,
          scope: 'work',
          kind: 'style',
          text: '문장을 짧게',
          source: 'author',
          status: 'off',
          createdBy: null,
        }}
      />,
    )
    expect(screen.getByText('적용 중')).toBeTruthy()
    expect(screen.getByText('꺼 둠')).toBeTruthy()
    expect(screen.queryByText('active')).toBeNull()
    expect(screen.queryByText('off')).toBeNull()
  })

  it('labels the character fields and the speech level of a character request', () => {
    render(
      <ChangeDiff
        targetTable="author_directives"
        before={null}
        after={{
          ...directiveBase,
          scope: 'character',
          kind: 'speech',
          text: '세린은 반말을 쓴다',
          source: 'author',
          status: 'active',
          createdBy: null,
          speechLevel: 'banmal',
        }}
      />,
    )
    // 말투 is both the kind value (speech) and the speech level field label.
    expect(screen.getAllByText('말투').length).toBeGreaterThan(0)
    expect(screen.getByText('반말')).toBeTruthy()
    expect(screen.getByText('인물')).toBeTruthy()
    expect(screen.queryByText('speechLevel')).toBeNull()
  })

  it('labels the AI context tier and the reveal chapter of a card and a fact', () => {
    const { unmount } = render(
      <ChangeDiff
        targetTable="wiki_entries"
        before={{ contextTier: 'mention' }}
        after={{ contextTier: 'always' }}
      />,
    )
    expect(screen.getByText('AI 문맥')).toBeTruthy()
    expect(screen.getByText('이름이 나오면 넣기')).toBeTruthy()
    expect(screen.getByText('항상 넣기')).toBeTruthy()
    expect(screen.queryByText('contextTier')).toBeNull()
    unmount()

    render(
      <ChangeDiff
        targetTable="facts"
        before={{ revealAtPosition: null }}
        after={{ revealAtPosition: 5 }}
      />,
    )
    expect(screen.getByText('공개 회차')).toBeTruthy()
    expect(screen.queryByText('revealAtPosition')).toBeNull()
  })
})
