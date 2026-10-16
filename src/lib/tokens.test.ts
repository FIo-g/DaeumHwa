import { describe, expect, it } from 'vitest'
import { randomToken } from '@/lib/tokens'

describe('randomToken', () => {
  it('returns base64url text of the expected length', () => {
    const token = randomToken()
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(randomToken(16)).toHaveLength(22)
  })

  it('returns different values on each call', () => {
    expect(randomToken()).not.toBe(randomToken())
  })
})
