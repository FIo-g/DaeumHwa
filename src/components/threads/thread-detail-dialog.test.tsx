// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThreadDetailDialog } from './thread-detail-dialog'
import type { ThreadItem } from './thread-types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/server/actions/threads', () => ({
  archiveThreadAction: vi.fn(),
  archiveThreadEventAction: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

const thread: ThreadItem = {
  id: 't1',
  title: '빛나는 목걸이',
  description: '',
  status: 'resolved',
  importance: 'high',
  plantedChapterId: 'c1',
  plantedPosition: 1,
  targetChapterPosition: null,
  overdue: false,
  relatedEntries: [],
  events: [
    {
      id: 'e1',
      kind: 'resolved',
      chapterId: 'c3',
      chapterPosition: 3,
      chapterTitle: '',
      note: '',
      evidence: '',
    },
  ],
}

describe('ThreadDetailDialog event archive', () => {
  it('explains that the thread status is recomputed from the remaining records', () => {
    render(
      <ThreadDetailDialog
        workId="w1"
        thread={thread}
        chapters={[]}
        entries={[]}
        canEdit
        open
        onOpenChange={() => {}}
      />,
    )

    // The event's archive button is the last 보관 button in the dialog (the thread's comes first).
    const archiveButtons = screen.getAllByRole('button', { name: '보관' })
    fireEvent.click(archiveButtons[archiveButtons.length - 1])

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('이 기록을 보관할까요?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '보관한 기록은 타임라인에서 사라지고, 떡밥 상태는 남은 기록에 맞춰 다시 계산됩니다.',
      ),
    ).toBeInTheDocument()
  })
})
