// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmButton } from './confirm-button'

afterEach(() => {
  cleanup()
})

describe('ConfirmButton', () => {
  it('opens a confirmation dialog without running the action', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmButton title="회차를 보관할까요?" description="나중에 되돌릴 수 있습니다." onConfirm={onConfirm}>
        보관
      </ConfirmButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: '보관' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('회차를 보관할까요?')
    expect(screen.getByText('나중에 되돌릴 수 있습니다.')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('runs onConfirm when the confirm label is pressed', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmButton title="회차를 보관할까요?" confirmLabel="보관하기" onConfirm={onConfirm}>
        보관
      </ConfirmButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: '보관' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '보관하기' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  it('does not run onConfirm when cancelled', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmButton title="회차를 보관할까요?" onConfirm={onConfirm}>
        보관
      </ConfirmButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: '보관' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '취소' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
