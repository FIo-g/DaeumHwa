// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { getTextWorker } from '@/lib/client/worker-client'
import { ExportButton } from './export-button'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/lib/client/worker-client', () => ({
  getTextWorker: vi.fn(),
}))

const buildBackupZip = vi.fn()
const payload = { work: { id: 'work-1', title: '테스트 작품' }, chapters: [] }

let downloadedName: string | null = null

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-16T03:00:00Z'))
  downloadedName = null
  buildBackupZip.mockResolvedValue(new Uint8Array([80, 75, 5, 6]))
  vi.mocked(getTextWorker).mockReturnValue({ buildBackupZip } as never)
  URL.createObjectURL = vi.fn(() => 'blob:backup')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedName = this.download
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(payload)),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ExportButton', () => {
  it('builds the zip in the worker and downloads it under the work name and Seoul date', async () => {
    render(<ExportButton workId="work-1" title="테스트 작품" />)
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }))

    await waitFor(() => expect(downloadedName).toBe('다음화-백업-테스트 작품-20261016.zip'))
    expect(fetch).toHaveBeenCalledWith('/api/works/work-1/export', expect.anything())
    expect(buildBackupZip).toHaveBeenCalledWith(payload)
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('shows progress text while the backup is being made', async () => {
    let finish: (value: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    )
    render(<ExportButton workId="work-1" title="테스트 작품" />)
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }))

    expect(await screen.findByText('백업 파일 만드는 중…')).toBeInTheDocument()
    finish(Response.json(payload))
    await waitFor(() => expect(downloadedName).not.toBeNull())
  })

  it('shows the server error and does not download when the export fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: '소유자만 내보낼 수 있습니다.' }, { status: 403 })),
    )
    render(<ExportButton workId="work-1" title="테스트 작품" />)
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('소유자만 내보낼 수 있습니다.'))
    expect(downloadedName).toBeNull()
  })
})
