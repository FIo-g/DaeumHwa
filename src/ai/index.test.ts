import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAiClient, getDefaultModel, getImportModel, setAiClientForTests } from '@/ai'
import { AnthropicAiClient } from '@/ai/anthropic'
import { OpencodeAiClient } from '@/ai/opencode'
import { AppError } from '@/lib/errors'
import { FakeAiClient } from '@/test/fake-ai'

const ENV_KEYS = [
  'AI_PROVIDER',
  'ANTHROPIC_API_KEY',
  'OPENCODE_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_MODEL_IMPORT',
  'OPENCODE_MODEL',
  'OPENCODE_MODEL_IMPORT',
] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  setAiClientForTests(null)
})

afterEach(() => {
  setAiClientForTests(null)
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('default and import models', () => {
  it('default to claude-haiku-5-5 in every provider when no model env is set', () => {
    expect(getDefaultModel()).toBe('claude-haiku-5-5')
    expect(getImportModel()).toBe('claude-haiku-5-5')

    process.env.ANTHROPIC_API_KEY = 'a'
    expect(getDefaultModel()).toBe('claude-haiku-5-5')

    delete process.env.ANTHROPIC_API_KEY
    process.env.OPENCODE_API_KEY = 'b'
    expect(getDefaultModel()).toBe('claude-haiku-5-5')
    expect(getImportModel()).toBe('claude-haiku-5-5')
  })

  it('anthropic provider reads ANTHROPIC_MODEL and ANTHROPIC_MODEL_IMPORT', () => {
    process.env.ANTHROPIC_API_KEY = 'a'
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5'
    expect(getDefaultModel()).toBe('claude-sonnet-5-5')
    expect(getImportModel()).toBe('claude-sonnet-5-5')

    process.env.ANTHROPIC_MODEL_IMPORT = 'claude-haiku-5-5'
    expect(getImportModel()).toBe('claude-haiku-5-5')
  })

  it('opencode provider reads OPENCODE_MODEL and OPENCODE_MODEL_IMPORT, not the Anthropic vars', () => {
    process.env.OPENCODE_API_KEY = 'b'
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5'
    process.env.OPENCODE_MODEL = 'qwen3.8-flash'
    expect(getDefaultModel()).toBe('qwen3.8-flash')
    expect(getImportModel()).toBe('qwen3.8-flash')

    process.env.OPENCODE_MODEL_IMPORT = 'claude-haiku-5-5'
    expect(getImportModel()).toBe('claude-haiku-5-5')
  })

  it('ignores blank model env values', () => {
    process.env.ANTHROPIC_API_KEY = 'a'
    process.env.ANTHROPIC_MODEL = '  '
    expect(getDefaultModel()).toBe('claude-haiku-5-5')
  })
})

describe('getAiClient', () => {
  it('throws AI_ERROR with the Korean key message when no key is set', () => {
    let caught: unknown
    try {
      getAiClient()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).code).toBe('AI_ERROR')
    expect((caught as AppError).message).toBe('AI 키가 설정되지 않아 AI 기능을 쓸 수 없습니다.')
  })

  it('does not cache the client when no provider resolves', () => {
    expect(() => getAiClient()).toThrow(AppError)
    process.env.ANTHROPIC_API_KEY = 'a'
    expect(getAiClient()).toBeInstanceOf(AnthropicAiClient)
  })

  it('returns the Anthropic client when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'a'
    const client = getAiClient()
    expect(client).toBeInstanceOf(AnthropicAiClient)
    expect(client.provider).toBe('anthropic')
    expect(client.defaultModel).toBe('claude-haiku-5-5')
  })

  it('returns the OpenCode Go client when only OPENCODE_API_KEY is set', () => {
    process.env.OPENCODE_API_KEY = 'b'
    process.env.OPENCODE_MODEL = 'qwen3.8-flash'
    const client = getAiClient()
    expect(client).toBeInstanceOf(OpencodeAiClient)
    expect(client.provider).toBe('opencode')
    expect(client.defaultModel).toBe('qwen3.8-flash')
  })

  it('AI_PROVIDER=opencode picks the OpenCode Go client over the Anthropic key', () => {
    process.env.AI_PROVIDER = 'opencode'
    process.env.ANTHROPIC_API_KEY = 'a'
    expect(getAiClient()).toBeInstanceOf(OpencodeAiClient)
  })

  it('an unknown AI_PROVIDER=fake falls back to the key-based provider', () => {
    process.env.AI_PROVIDER = 'fake'
    process.env.OPENCODE_API_KEY = 'b'
    expect(getAiClient()).toBeInstanceOf(OpencodeAiClient)
  })

  it('returns the override set for tests', () => {
    const fake = new FakeAiClient()
    setAiClientForTests(fake)
    expect(getAiClient()).toBe(fake)
  })
})
