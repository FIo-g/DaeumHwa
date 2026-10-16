// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bulkApproveAction } from '@/server/actions/proposals'
import { ImportBatchBanner } from './import-batch-banner'

vi.mock('@/server/actions/proposals', () => ({
  bulkApproveAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const bulk = vi.mocked(bulkApproveAction)

beforeEach(() => {
  vi.clearAllMocks()
  bulk.mockResolvedValue({ ok: true, data: { approved: 3, failed: [] } })
})

afterEach(() => {
  cleanup()
})

describe('ImportBatchBanner', () => {
  it('shows the batch count', () => {
    render(<ImportBatchBanner workId="work-1" sourceRef="job-1" count={3} />)
    expect(screen.getByText('원고 가져오기 제안 3건')).toBeInTheDocument()
  })

  it('approves every proposal of the batch after confirmation', async () => {
    render(<ImportBatchBanner workId="work-1" sourceRef="job-1" count={3} />)
    fireEvent.click(screen.getByRole('button', { name: '이 가져오기의 제안 모두 승인' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }))

    await waitFor(() => expect(bulk).toHaveBeenCalledWith({ workId: 'work-1', sourceRef: 'job-1' }))
  })
})
