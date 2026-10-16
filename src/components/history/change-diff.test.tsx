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
    expect(screen.getByText('바뀐 내용이 없습니다.')).toBeInTheDocument()
  })
})
