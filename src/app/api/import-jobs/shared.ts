import { type ErrorCode, isAppError } from '@/lib/errors'

// Shared error mapping for the import-job route handlers.

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_STATE: 409,
  AI_LIMIT: 429,
}

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function serviceError(error: unknown): Response {
  if (isAppError(error)) {
    return jsonError(STATUS_BY_CODE[error.code] ?? 400, error.message)
  }
  console.error(error)
  return jsonError(500, '알 수 없는 오류가 발생했습니다.')
}
