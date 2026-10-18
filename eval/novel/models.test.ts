import { describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { OllamaAiClient } from '@/ai/ollama'
import { OpencodeAiClient } from '@/ai/opencode'
import { MODEL_IDS, MODEL_PROFILES, createModelClient } from './models'

describe('MODEL_PROFILES', () => {
  it('has a profile with a matching id for every model id', () => {
    for (const id of MODEL_IDS) {
      expect(MODEL_PROFILES[id].id).toBe(id)
    }
  })

  it('gives every local profile a context window of at least 32768', () => {
    const local = MODEL_IDS.filter((id) => MODEL_PROFILES[id].queue === 'local')
    expect(local.length).toBeGreaterThan(0)
    for (const id of local) {
      expect(MODEL_PROFILES[id].ollama?.numCtx ?? 0).toBeGreaterThanOrEqual(32768)
    }
  })
})

describe('createModelClient', () => {
  it('returns an OllamaAiClient for a local Qwen profile', () => {
    const client = createModelClient(MODEL_PROFILES['qwen3.8-27b'])
    expect(client).toBeInstanceOf(OllamaAiClient)
    expect(client.defaultModel).toBe('qwen3.8:27b-mlx')
  })

  it('returns an OpencodeAiClient for the luna-6 profile', () => {
    vi.stubEnv('OPENCODE_API_KEY', 'test-dummy-key')
    const client = createModelClient(MODEL_PROFILES['luna-6'])
    expect(client).toBeInstanceOf(OpencodeAiClient)
    expect(client.defaultModel).toBe('gpt-6-luna')
    vi.unstubAllEnvs()
  })

  it('returns a FakeAiClient for the fake profile', () => {
    expect(createModelClient(MODEL_PROFILES.fake)).toBeInstanceOf(FakeAiClient)
  })
})
