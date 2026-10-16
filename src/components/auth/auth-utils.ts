export type AuthMode = 'login' | 'signup'

const GENERIC_ERROR = '잠시 후 다시 시도해 주세요.'

/** Maps a Better Auth error code to a short Korean message for the auth form. */
export function authErrorMessage(mode: AuthMode, code: string | null | undefined): string {
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
