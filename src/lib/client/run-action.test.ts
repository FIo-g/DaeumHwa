import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { runAction } from './run-action'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runAction', () => {
  it('returns the data and shows the success toast when the action succeeds', async () => {
    const data = await runAction(Promise.resolve({ ok: true, data: { id: 'w1' } }), {
      success: '저장했습니다.',
    })
    expect(data).toEqual({ id: 'w1' })
    expect(toast.success).toHaveBeenCalledWith('저장했습니다.')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('returns null and shows the error message when the action fails', async () => {
    const data = await runAction(
      Promise.resolve({ ok: false, error: { code: 'FORBIDDEN', message: '권한이 없습니다.' } }),
      { success: '저장했습니다.' },
    )
    expect(data).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('권한이 없습니다.')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('returns null without an error toast when the call was cancelled', async () => {
    const data = await runAction(
      Promise.resolve({ ok: false, error: { code: 'CANCELLED', message: '취소했습니다.' } }),
    )
    expect(data).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('returns null and shows a generic message when the request itself rejects', async () => {
    const data = await runAction(Promise.reject(new TypeError('network')))
    expect(data).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('잠시 후 다시 시도해 주세요.')
  })
})
