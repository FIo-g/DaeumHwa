// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTextWorker } from '@/lib/client/worker-client'
import { FileDrop } from './file-drop'

vi.mock('@/lib/client/worker-client', () => ({
  getTextWorker: vi.fn(),
}))

const parseFile = vi.fn()

beforeEach(() => {
  vi.mocked(getTextWorker).mockReturnValue({ parseFile } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function chooseFile(file: File) {
  fireEvent.change(screen.getByLabelText('원고 파일'), { target: { files: [file] } })
}

describe('FileDrop', () => {
  it('reports the parse error and re-enables the file input instead of hanging', async () => {
    parseFile.mockRejectedValue(new Error('HWP 파일은 지원하지 않습니다.'))
    const onParsed = vi.fn()
    render(<FileDrop onParsed={onParsed} />)

    chooseFile(new File(['x'], '원고.hwp'))

    expect(await screen.findByRole('alert')).toHaveTextContent('HWP 파일은 지원하지 않습니다.')
    expect(screen.queryByText('파일을 읽는 중입니다.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('원고 파일')).toBeEnabled()
    expect(onParsed).not.toHaveBeenCalled()
  })

  it('shows a generic message when the worker failure is not an Error', async () => {
    parseFile.mockRejectedValue('boom')
    render(<FileDrop onParsed={vi.fn()} />)

    chooseFile(new File(['x'], '원고.txt'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '파일을 읽지 못했습니다. 다시 시도해 주세요.',
    )
  })

  it('passes the decoded text to onParsed when parsing succeeds', async () => {
    parseFile.mockResolvedValue({ text: '1화\n본문', encoding: 'utf-8', format: 'txt' })
    const onParsed = vi.fn()
    render(<FileDrop onParsed={onParsed} />)

    chooseFile(new File(['x'], '원고.txt'))

    await waitFor(() =>
      expect(onParsed).toHaveBeenCalledWith({ fileName: '원고.txt', text: '1화\n본문' }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
