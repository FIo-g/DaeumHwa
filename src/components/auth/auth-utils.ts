export type AuthMode = 'login' | 'signup'

const GENERIC_ERROR = '잠시 후 다시 시도해 주세요.'
const RATE_LIMIT_ERROR = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'

/** The error part of a Better Auth client result. A rate-limited request has no code. */
export type AuthError = { code?: string | null; status?: number | null }

/** Maps a Better Auth error to a short Korean message for the auth form. */
export function authErrorMessage(mode: AuthMode, error: AuthError | null | undefined): string {
  if (error?.status === 429) return RATE_LIMIT_ERROR
  const code = error?.code
  if (mode === 'login' && code === 'INVALID_EMAIL_OR_PASSWORD') {
    return '이메일 또는 비밀번호가 맞지 않습니다.'
  }
  if (
    mode === 'signup' &&
    (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
  ) {
    return '이미 가입된 이메일입니다.'
  }
  return GENERIC_ERROR
}

/**
 * Accepts only same-origin absolute paths from the `next` query parameter.
 * Anything else (external URLs, protocol-relative paths, whitespace or backslashes
 * that browsers normalize into external targets) is dropped.
 */
export function safeNextPath(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined
  if (/[\\\s]/.test(value)) return undefined
  return value
}
