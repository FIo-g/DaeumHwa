import { FakeAiClient } from '@/test/fake-ai'
import {
  OllamaAiClient,
  type OllamaCallStats,
  type OllamaOptions,
  ollamaTransport,
} from '@/ai/ollama'
import { OpencodeAiClient } from '@/ai/opencode'
import type { AiClient, AiEffort } from '@/ai/types'

export const MODEL_IDS = [
  'qwen3.8-27b',
  'gpt-oss-20b',
  'exaone3.5-32b',
  'haiku-5.5',
  'luna-6',
  'fake',
] as const

export type ModelId = (typeof MODEL_IDS)[number]

export type ModelProfile = {
  id: ModelId
  queue: 'local' | 'cloud' | 'test'
  provider: 'ollama' | 'opencode' | 'fake'
  model: string
  effort: AiEffort
  maxTokensFloor: number
  timeoutMs: number
  ollama?: Omit<OllamaOptions, 'model' | 'fetch' | 'baseUrl'>
  /** e.g. 'mlx' | 'gguf' | 'api'; filled by Task 10. */
  variant: string
}

const LOCAL_TIMEOUT_MS = 3_600_000
const CLOUD_TIMEOUT_MS = 900_000

/** Initial values. Task 10 replaces the ollama numbers and tags with researched, measured ones. */
export const MODEL_PROFILES: Record<ModelId, ModelProfile> = {
  'qwen3.8-27b': {
    id: 'qwen3.8-27b',
    queue: 'local',
    provider: 'ollama',
    model: 'qwen3.8:27b-mlx',
    effort: 'max',
    maxTokensFloor: 32000,
    timeoutMs: LOCAL_TIMEOUT_MS,
    ollama: { numCtx: 262144, temperature: 1.0, topP: 0.95, topK: 20, minP: 0, think: true },
    variant: 'mlx',
  },
  'gpt-oss-20b': {
    id: 'gpt-oss-20b',
    queue: 'local',
    provider: 'ollama',
    model: 'gpt-oss:20b',
    effort: 'max',
    maxTokensFloor: 32000,
    timeoutMs: LOCAL_TIMEOUT_MS,
    ollama: { numCtx: 131072, temperature: 1.0, topP: 1.0, think: 'high' },
    variant: 'gguf',
  },
  'exaone3.5-32b': {
    id: 'exaone3.5-32b',
    queue: 'local',
    provider: 'ollama',
    model: 'exaone3.5:32b',
    effort: 'max',
    // Its context is 32768 and it has no thinking mode, so a 32000 output floor would leave no room for the prompt.
    maxTokensFloor: 8192,
    timeoutMs: LOCAL_TIMEOUT_MS,
    ollama: { numCtx: 32768, temperature: 1.0, think: false },
    variant: 'gguf',
  },
  'haiku-5.5': {
    id: 'haiku-5.5',
    queue: 'cloud',
    provider: 'opencode',
    model: 'claude-haiku-5-5',
    // User decision 2026-10-18 after the pilot: at 'max' Haiku spent the whole output budget on thinking and drafts were cut off.
    effort: 'high',
    maxTokensFloor: 32000,
    timeoutMs: CLOUD_TIMEOUT_MS,
    variant: 'api',
  },
  'luna-6': {
    id: 'luna-6',
    queue: 'cloud',
    provider: 'opencode',
    model: 'gpt-6-luna',
    // User decision 2026-10-18 after the pilot: at 'max' Haiku spent the whole output budget on thinking and drafts were cut off.
    effort: 'high',
    maxTokensFloor: 32000,
    timeoutMs: CLOUD_TIMEOUT_MS,
    variant: 'api',
  },
  fake: {
    id: 'fake',
    queue: 'test',
    provider: 'fake',
    model: 'fake',
    effort: 'max',
    maxTokensFloor: 32000,
    timeoutMs: CLOUD_TIMEOUT_MS,
    variant: 'test',
  },
}

/** Builds the AI client a profile runs on. `fetch` is injected in tests. */
export function createModelClient(
  profile: ModelProfile,
  o: { fetch?: typeof fetch; onStats?: (s: OllamaCallStats) => void } = {},
): AiClient {
  switch (profile.provider) {
    case 'ollama':
      if (!profile.ollama) throw new Error(`${profile.id}: ollama settings are missing`)
      return new OllamaAiClient({
        ...profile.ollama,
        model: profile.model,
        fetch: o.fetch ?? ollamaTransport,
        onStats: o.onStats,
      })
    case 'opencode':
      return new OpencodeAiClient(undefined, profile.model)
    case 'fake':
      return new FakeAiClient()
  }
}
