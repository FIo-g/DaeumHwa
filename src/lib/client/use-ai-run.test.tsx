// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiRun } from '@/lib/client/use-ai-run'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useAiRun', () => {
  it('counts elapsed seconds while the call runs', () => {
    const { result } = renderHook(() => useAiRun())
    act(() => {
      void result.current.run(() => new Promise(() => {}))
    })
    expect(result.current.running).toBe(true)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.elapsedSec).toBe(3)
  })

  it('aborts the signal given to fn and resolves run with null when cancelled', async () => {
    const { result } = renderHook(() => useAiRun())
    let seen: AbortSignal | undefined
    let pending!: Promise<string | null>
    act(() => {
      pending = result.current.run((signal) => {
        seen = signal
        return new Promise(() => {})
      })
    })
    act(() => {
      result.current.cancel()
    })
    await expect(pending).resolves.toBeNull()
    expect(seen?.aborted).toBe(true)
    expect(result.current.running).toBe(false)
    expect(toast).toHaveBeenCalledWith('취소했습니다.')
  })

  it('resolves with the value and clears running when the call finishes', async () => {
    const { result } = renderHook(() => useAiRun())
    let pending!: Promise<number | null>
    act(() => {
      pending = result.current.run(async () => 42)
    })
    await act(async () => {
      await expect(pending).resolves.toBe(42)
    })
    expect(result.current.running).toBe(false)
    expect(toast).not.toHaveBeenCalled()
  })

  it('ignores cancel when nothing is running', () => {
    const { result } = renderHook(() => useAiRun())
    act(() => {
      result.current.cancel()
    })
    expect(toast).not.toHaveBeenCalled()
  })
})
