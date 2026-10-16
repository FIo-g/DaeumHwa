import { afterEach, describe, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { AppError } from '@/lib/errors'
import { fail, ok, toActionResult } from '@/lib/result'

describe('result helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ok and fail build ActionResult values', () => {
    expect(ok(3)).toEqual({ ok: true, data: 3 })
    expect(fail('NOT_FOUND', '없습니다.')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: '없습니다.' },
    })
  })

  it('toActionResult wraps successful data', async () => {
    expect(await toActionResult(async () => 'done')).toEqual({ ok: true, data: 'done' })
  })

  it('maps AppError to its code and message', async () => {
    const result = await toActionResult(async () => {
      throw new AppError('CONFLICT', '다른 사람이 먼저 고쳤습니다.')
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: '다른 사람이 먼저 고쳤습니다.' },
    })
  })

  it('maps ZodError to VALIDATION with a generic Korean message', async () => {
    const result = await toActionResult(async () => z.object({ a: z.string() }).parse({ a: 1 }))
    expect(result).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: '입력값이 올바르지 않습니다.' },
    })
  })

  it('maps unknown errors to BAD_STATE and logs them', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await toActionResult(async () => {
      throw new Error('boom')
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'BAD_STATE', message: '알 수 없는 오류가 발생했습니다.' },
    })
    expect(spy).toHaveBeenCalled()
  })

  it('rethrows Next.js redirect errors instead of converting them', async () => {
    await expect(
      toActionResult(async () => {
        redirect('/works')
      }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
  })
})
