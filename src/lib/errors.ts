export type ErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'AI_LIMIT'
  | 'AI_ERROR'
  | 'CANCELLED'
  | 'BAD_STATE'
  | 'UNAUTHENTICATED'

/**
 * Thrown by services. `message` is a short Korean sentence shown to the user.
 * Server actions catch it and return an ActionResult; they never rethrow it.
 */
export class AppError extends Error {
  code: ErrorCode
  details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}
