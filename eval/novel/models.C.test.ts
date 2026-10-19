import { describe, expect, it } from 'vitest'
import { OllamaAiClient } from '@/ai/ollama'
import { createModelClient, MODEL_IDS, MODEL_PROFILES } from './models'

// Track C: the lower-temperature qwen profile for the Han-in-Korean comparison (spec 7, brief C).

describe('qwen3.8-27b-t06 profile', () => {
  it('is listed as a model id', () => {
    expect(MODEL_IDS).toContain('qwen3.8-27b-t06')
  })

  it('differs from the qwen profile only in temperature', () => {
    const qwen = MODEL_PROFILES['qwen3.8-27b']
    const t06 = MODEL_PROFILES['qwen3.8-27b-t06']
    expect(t06.id).toBe('qwen3.8-27b-t06')
    expect(t06.ollama?.temperature).toBe(0.6)
    expect({ ...t06.ollama, temperature: qwen.ollama?.temperature }).toEqual(qwen.ollama)
    expect(t06.model).toBe(qwen.model)
    expect(t06.effort).toBe(qwen.effort)
    expect(t06.maxTokensFloor).toBe(qwen.maxTokensFloor)
    expect(t06.timeoutMs).toBe(qwen.timeoutMs)
    expect(t06.queue).toBe('local')
    expect(t06.provider).toBe('ollama')
    expect(t06.variant).toBe(qwen.variant)
  })

  it('builds an Ollama client', () => {
    expect(createModelClient(MODEL_PROFILES['qwen3.8-27b-t06'])).toBeInstanceOf(OllamaAiClient)
  })
})
