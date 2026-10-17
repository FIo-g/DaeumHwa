import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ENV_KEYS = ['AI_PROVIDER', 'ANTHROPIC_API_KEY', 'OPENCODE_API_KEY'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  vi.resetModules()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

async function load() {
  return import('@/lib/ai-mode')
}

describe('getAiProvider', () => {
  it('is fake when no key and no provider are set', async () => {
    const { getAiProvider } = await load()
    expect(getAiProvider()).toBe('fake')
  })

  it('picks anthropic when only ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { getAiProvider } = await load()
    expect(getAiProvider()).toBe('anthropic')
  })

  it('picks opencode when only OPENCODE_API_KEY is set', async () => {
    process.env.OPENCODE_API_KEY = 'oc-key'
    const { getAiProvider } = await load()
    expect(getAiProvider()).toBe('opencode')
  })

  it('prefers anthropic in auto mode when both keys are set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.OPENCODE_API_KEY = 'oc-key'
    const { getAiProvider } = await load()
    expect(getAiProvider()).toBe('anthropic')
  })

  it('treats an empty key as not set', async () => {
    process.env.ANTHROPIC_API_KEY = '   '
    process.env.OPENCODE_API_KEY = 'oc-key'
    const { getAiProvider } = await load()
    expect(getAiProvider()).toBe('opencode')
  })

  it.each([
    ['fake', {}, 'fake'],
    ['fake', { ANTHROPIC_API_KEY: 'a', OPENCODE_API_KEY: 'b' }, 'fake'],
    ['anthropic', {}, 'anthropic'],
    ['anthropic', { OPENCODE_API_KEY: 'b' }, 'anthropic'],
    ['opencode', {}, 'opencode'],
    ['opencode', { ANTHROPIC_API_KEY: 'a' }, 'opencode'],
  ])('AI_PROVIDER=%s with env %j resolves to %s', async (provider, env, expected) => {
    process.env.AI_PROVIDER = provider
    for (const [key, value] of Object.entries(env)) process.env[key] = value
    const { getAiProvider } = await load()
    expect(getAiProvider()).toBe(expected)
  })

  it('ignores an unknown AI_PROVIDER value, warns once and falls back to auto', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.AI_PROVIDER = 'gemini'
    process.env.OPENCODE_API_KEY = 'oc-key'
    const { getAiProvider } = await load()
    expect(getAiProvider()).toBe('opencode')
    expect(getAiProvider()).toBe('opencode')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('gemini')
  })

  it('treats an empty AI_PROVIDER as unset without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.AI_PROVIDER = ''
    const { getAiProvider } = await load()
    expect(getAiProvider()).toBe('fake')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('isDemoMode', () => {
  it('is demo mode only when the resolved provider is fake', async () => {
    const { isDemoMode } = await load()
    expect(isDemoMode()).toBe(true)
  })

  it('is not demo mode when an API key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { isDemoMode } = await load()
    expect(isDemoMode()).toBe(false)
  })

  it('is not demo mode when only OPENCODE_API_KEY is set', async () => {
    process.env.OPENCODE_API_KEY = 'oc-key'
    const { isDemoMode } = await load()
    expect(isDemoMode()).toBe(false)
  })

  it('AI_PROVIDER overrides the key checks', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.AI_PROVIDER = 'fake'
    const { isDemoMode } = await load()
    expect(isDemoMode()).toBe(true)
  })

  it('AI_PROVIDER=opencode is not demo mode even without a key', async () => {
    process.env.AI_PROVIDER = 'opencode'
    const { isDemoMode } = await load()
    expect(isDemoMode()).toBe(false)
  })
})
