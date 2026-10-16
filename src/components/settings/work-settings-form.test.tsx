// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { updateWorkAction } from '@/server/actions/works'
import { WorkSettingsForm } from './work-settings-form'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}))

vi.mock('@/server/actions/works', () => ({
  updateWorkAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const update = vi.mocked(updateWorkAction)

const initial = {
  title: '별빛 계약',
  genre: '현대 판타지',
  logline: '계약서 한 장으로 시작되는 이야기',
  synopsis: '줄거리',
  absenceThreshold: 10,
  targetChars: 5500,
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('WorkSettingsForm', () => {
  it('shows every work field with a label for the owner', () => {
    render(<WorkSettingsForm workId="w1" canEdit initial={initial} />)
    expect(screen.getByLabelText('제목')).toHaveValue('별빛 계약')
    expect(screen.getByLabelText('장르')).toHaveValue('현대 판타지')
    expect(screen.getByLabelText('한 줄 소개')).toHaveValue('계약서 한 장으로 시작되는 이야기')
    expect(screen.getByLabelText('시놉시스')).toHaveValue('줄거리')
    expect(screen.getByLabelText('장기 미등장 경고 기준 (회차 수)')).toHaveValue(10)
    expect(screen.getByLabelText('목표 글자 수')).toHaveValue(5500)
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })

  it('is read-only for members who are not the owner', () => {
    render(<WorkSettingsForm workId="w1" canEdit={false} initial={initial} />)
    expect(screen.getByLabelText('제목')).toBeDisabled()
    expect(screen.getByLabelText('시놉시스')).toBeDisabled()
    expect(screen.getByLabelText('목표 글자 수')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    expect(screen.getByText('소유자만 작품 정보를 바꿀 수 있습니다.')).toBeInTheDocument()
  })

  it('saves the changed fields and refreshes the page', async () => {
    run.mockResolvedValue({} as never)
    render(<WorkSettingsForm workId="w1" canEdit initial={initial} />)
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '새 제목' } })
    fireEvent.change(screen.getByLabelText('목표 글자 수'), { target: { value: '6000' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith({
      workId: 'w1',
      title: '새 제목',
      genre: '현대 판타지',
      logline: '계약서 한 장으로 시작되는 이야기',
      synopsis: '줄거리',
      settings: { absenceThreshold: 10, targetChars: 6000 },
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
