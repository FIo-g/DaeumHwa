// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImportJobRow } from '@/db/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/server/actions/imports', () => ({
  cancelImportJobAction: vi.fn(),
  pauseImportJobAction: vi.fn(),
  skipImportChapterAction: vi.fn(),
  startImportJobAction: vi.fn(),
}))

import { ImportProgress, toSnapshot } from '@/components/import/import-progress'

function job(overrides: Partial<ImportJobRow> = {}): ImportJobRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    workId: '00000000-0000-4000-8000-000000000002',
    fileName: 'novel.txt',
    status: 'error',
    chapterIds: [],
    cursor: 1,
    totalChapters: 3,
    processedChapters: 1,
    proposalCount: 0,
    state: { knownEntities: [], threadTitles: [] },
    error: '2화에서 멈췄습니다: AI 호출에 실패했습니다: refusal',
    runner: 'client',
    createdBy: '00000000-0000-4000-8000-000000000003',
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    ...overrides,
  } as ImportJobRow
}

describe('ImportProgress skip control', () => {
  afterEach(() => cleanup())

  it('offers a skip button for an editor when the job stopped with an error', () => {
    render(<ImportProgress workId="w" initial={toSnapshot(job())} canEdit />)
    expect(screen.getByRole('button', { name: '이 화 건너뛰기' })).toBeTruthy()
  })

  it('hides the skip button for a running job, a viewer, or a finished job', () => {
    const { unmount } = render(
      <ImportProgress
        workId="w"
        initial={toSnapshot(job({ status: 'running', error: null }))}
        canEdit
      />,
    )
    expect(screen.queryByRole('button', { name: '이 화 건너뛰기' })).toBeNull()
    unmount()

    const viewer = render(<ImportProgress workId="w" initial={toSnapshot(job())} canEdit={false} />)
    expect(screen.queryByRole('button', { name: '이 화 건너뛰기' })).toBeNull()
    viewer.unmount()
  })

  it('lists the skipped chapters from the job state', () => {
    const skipped = job({
      status: 'done',
      error: null,
      state: {
        knownEntities: [],
        threadTitles: [],
        skipped: [{ chapterId: 'c2', position: 2, title: '2화', reason: 'refusal' }],
      } as ImportJobRow['state'],
    })
    render(<ImportProgress workId="w" initial={toSnapshot(skipped)} canEdit />)
    expect(screen.getByText('건너뛴 회차: 2화')).toBeTruthy()
  })
})
