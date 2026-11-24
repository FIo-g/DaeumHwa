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
    expect(screen.getByText('저장하지 않은 변경이 있어요. 복구할까요?')).toBeTruthy()
    expect(screen.getByRole('button', { name: '버리기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '복구' })).toBeTruthy()
  })

  it('explains the conflict and offers to keep the server copy when the draft is stale', () => {
    const onRecover = vi.fn()
    const onDiscard = vi.fn()
    render(<RecoveryDialog open savedAt={null} stale onRecover={onRecover} onDiscard={onDiscard} />)
    expect(screen.getByText('서버 원고와 이 기기의 임시 저장본이 달라요.')).toBeTruthy()
    expect(screen.getByText(/이전 원고는 버전 이력에 남아요/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '서버 원고 유지' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '이 기기 원고로 복구' }))
    expect(onRecover).toHaveBeenCalledTimes(1)
  })
})
