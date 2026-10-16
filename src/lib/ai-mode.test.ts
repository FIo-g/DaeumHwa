import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isDemoMode } from '@/lib/ai-mode'

describe('isDemoMode', () => {
  const saved = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  }

  beforeEach(() => {
    delete process.env.AI_PROVIDER
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('is demo mode when no key and no provider are set', () => {
    expect(isDemoMode()).toBe(true)
  })

  it('is not demo mode when an API key is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    expect(isDemoMode()).toBe(false)
  })

  it('AI_PROVIDER overrides the API key check', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.AI_PROVIDER = 'fake'
    expect(isDemoMode()).toBe(true)

    process.env.AI_PROVIDER = 'anthropic'
    delete process.env.ANTHROPIC_API_KEY
    expect(isDemoMode()).toBe(false)
  })
})
