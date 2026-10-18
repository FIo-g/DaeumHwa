import type { ActionResult } from '@/lib/result'

const RETRY_MESSAGE = '잠시 후 다시 시도해 주세요.'
const CANCELLED_MESSAGE = '취소했습니다.'

/**
 * POSTs JSON to a route handler that answers with an ActionResult. Use it for AI calls that
 * run longer than a Server Action should hold the client queue. A network failure or a body
 * that is not an ActionResult becomes a failed result, so `runAction(postAction(...))` works.
 * An aborted `signal` resolves to a CANCELLED result.
 */
export async function postAction<T>(
  url: string,
  body: unknown,
  options?: { signal?: AbortSignal },
): Promise<ActionResult<T>> {
  let parsed: unknown
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(options?.signal ? { signal: options.signal } : {}),
    })
    parsed = await res.json()
  } catch {
    if (options?.signal?.aborted) return cancelled()
    return failed()
  }
  if (!isActionResult(parsed)) return failed()
  return parsed as ActionResult<T>
}

function failed<T>(): ActionResult<T> {
  return { ok: false, error: { code: 'BAD_STATE', message: RETRY_MESSAGE } }
}

function cancelled<T>(): ActionResult<T> {
  return { ok: false, error: { code: 'CANCELLED', message: CANCELLED_MESSAGE } }
}

function isActionResult(value: unknown): value is ActionResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  if (value.ok === true) return 'data' in value
  if (value.ok === false) {
    return (
      'error' in value &&
      typeof value.error === 'object' &&
      value.error !== null &&
      'message' in value.error &&
      typeof value.error.message === 'string'
    )
  }
  return false
}
