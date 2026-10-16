import { unstable_rethrow } from 'next/navigation'
import { ZodError } from 'zod'
import { type ErrorCode, isAppError } from '@/lib/errors'

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(code: ErrorCode, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

/**
 * Runs a server-action body and converts thrown errors into an ActionResult.
 * Next.js control-flow errors (redirect, notFound) are rethrown so the framework handles them.
 */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn())
  } catch (e) {
    unstable_rethrow(e)
    if (isAppError(e)) return fail(e.code, e.message)
    if (e instanceof ZodError) return fail('VALIDATION', '입력값이 올바르지 않습니다.')
    console.error(e)
    return fail('BAD_STATE', '알 수 없는 오류가 발생했습니다.')
  }
}
