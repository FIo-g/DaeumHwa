import { describe, expect, it } from 'vitest'
import { authErrorMessage, safeNextPath } from './auth-utils'

describe('safeNextPath', () => {
  it('keeps same-origin absolute paths', () => {
    expect(safeNextPath('/works/abc/chapters')).toBe('/works/abc/chapters')
  })

  it('rejects protocol-relative and external targets', () => {
    expect(safeNextPath('//evil.example')).toBeUndefined()
    expect(safeNextPath('/\\evil.example')).toBeUndefined()
    expect(safeNextPath('https://evil.example')).toBeUndefined()
  })

  it('rejects missing or relative values', () => {
    expect(safeNextPath(undefined)).toBeUndefined()
    expect(safeNextPath('')).toBeUndefined()
    expect(safeNextPath('works')).toBeUndefined()
  })

  it('rejects paths with whitespace or backslashes, which browsers normalize into external targets', () => {
    expect(safeNextPath('/\t/evil.example')).toBeUndefined()
    expect(safeNextPath('/works\\..')).toBeUndefined()
    expect(safeNextPath('/works now')).toBeUndefined()
  })

  it('takes the first value of a repeated query parameter', () => {
    expect(safeNextPath(['/works', '/login'])).toBe('/works')
  })
})

describe('authErrorMessage', () => {
  it('maps a wrong email or password on login', () => {
    expect(authErrorMessage('login', { code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      '이메일 또는 비밀번호가 맞지 않습니다.',
    )
  })

  it('maps a duplicate email on signup', () => {
    expect(authErrorMessage('signup', { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })).toBe(
      '이미 가입된 이메일입니다.',
    )
    expect(authErrorMessage('signup', { code: 'USER_ALREADY_EXISTS' })).toBe('이미 가입된 이메일입니다.')
  })

  it('falls back to the generic message for anything else', () => {
    expect(authErrorMessage('login', { code: 'SOMETHING_ELSE' })).toBe('잠시 후 다시 시도해 주세요.')
    expect(authErrorMessage('signup', undefined)).toBe('잠시 후 다시 시도해 주세요.')
    expect(authErrorMessage('signup', null)).toBe('잠시 후 다시 시도해 주세요.')
  })

  it('maps HTTP 429 to the rate limit message, with or without a code', () => {
    expect(authErrorMessage('signup', { status: 429 })).toBe(
      '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    )
    expect(authErrorMessage('login', { status: 429, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    )
  })
})
