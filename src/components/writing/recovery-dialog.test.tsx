// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecoveryDialog } from './recovery-dialog'

afterEach(() => {
  cleanup()
})

describe('RecoveryDialog', () => {
  it('uses the plain wording for a draft that is newer than the server', () => {
    render(<RecoveryDialog open savedAt={null} onRecover={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByText('저장되지 않은 변경이 있습니다. 복구할까요?')).toBeTruthy()
    expect(screen.getByRole('button', { name: '버리기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '복구' })).toBeTruthy()
  })

  it('explains the conflict and offers to keep the server copy when the draft is stale', () => {
    const onRecover = vi.fn()
    const onDiscard = vi.fn()
    render(<RecoveryDialog open savedAt={null} stale onRecover={onRecover} onDiscard={onDiscard} />)
    expect(
      screen.getByText('다른 곳에서 수정된 원고가 있어, 이 기기의 임시 저장본과 다릅니다.'),
    ).toBeTruthy()
    expect(screen.getByText(/이전 원고는 버전 이력에 남습니다/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '서버 원고 유지' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '이 기기 원고로 복구' }))
    expect(onRecover).toHaveBeenCalledTimes(1)
  })
})
