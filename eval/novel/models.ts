import { FakeAiClient } from '@/test/fake-ai'
import {
  OllamaAiClient,
  type OllamaCallStats,
  type OllamaOptions,
  type OllamaThink,
  ollamaTransport,
} from '@/ai/ollama'
import { OpencodeAiClient } from '@/ai/opencode'
import type { AiClient, AiEffort } from '@/ai/types'
import { AI_TASKS, type AiTaskName } from '@/db/types'

export const MODEL_IDS = [
  'qwen3.8-27b',
  'qwen3.8-27b-t06',
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

const QWEN_OLLAMA: NonNullable<ModelProfile['ollama']> = {
  numCtx: 262144,
  temperature: 1.0,
  topP: 0.95,
  topK: 20,
  minP: 0,
  think: true,
}

const QWEN: ModelProfile = {
  id: 'qwen3.8-27b',
  queue: 'local',
  provider: 'ollama',
  model: 'qwen3.8:27b-mlx',
  effort: 'max',
  maxTokensFloor: 32000,
  timeoutMs: LOCAL_TIMEOUT_MS,
  ollama: QWEN_OLLAMA,
  variant: 'mlx',
}

/** Initial values. Task 10 replaces the ollama numbers and tags with researched, measured ones. */
export const MODEL_PROFILES: Record<ModelId, ModelProfile> = {
  'qwen3.8-27b': QWEN,
  // Comparison for the Han-in-Korean hypothesis. Vendor value is 1.0; this is an experiment, run
  // under a new date, never reuse its results as the main qwen run.
  'qwen3.8-27b-t06': {
    ...QWEN,
    id: 'qwen3.8-27b-t06',
    ollama: { ...QWEN_OLLAMA, temperature: 0.6 },
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

/** Think level for helper tasks in a compare run. 'off' is Ollama's `think: false`. */
export type HelperThink = 'off' | 'low' | 'medium' | 'high'
export const HELPER_THINKS: readonly HelperThink[] = ['off', 'low', 'medium', 'high']

/** Tasks that write manuscript prose. They keep the profile's own think in a helper compare. */
export const PROSE_TASKS: readonly AiTaskName[] = [
  'draft-chapter',
  'draft-continue',
  'scene-rewrite',
]
/** Every other AI task: the object calls and the prose-editing helpers. */
export const HELPER_TASKS: readonly AiTaskName[] = AI_TASKS.filter(
  (task) => !PROSE_TASKS.includes(task),
)

/** Maps a helper setting to Ollama's `think` value. */
export function helperThinkValue(h: HelperThink): OllamaThink {
  return h === 'off' ? false : h
}

/**
 * The `think` value a call of this task sends on this profile, or null when the profile has no
 * Ollama settings. A helper setting applies to helper tasks only.
 */
export function thinkFor(
  profile: ModelProfile,
  task: AiTaskName,
  helper?: HelperThink,
): OllamaThink | null {
  if (!profile.ollama) return null
  if (helper && HELPER_TASKS.includes(task)) return helperThinkValue(helper)
  return profile.ollama.think ?? null
}

/**
 * Why a helper setting cannot take effect on this profile, or null when it can. Ollama takes
 * boolean think on qwen, levels on gpt-oss and ignores `think: false` on gpt-oss, so `off` is only
 * accepted where the profile's own think is boolean `true`.
 */
export function checkHelperThink(profile: ModelProfile, h: HelperThink): string | null {
  if (!profile.ollama) return `${profile.id}: --helper-think needs a local Ollama profile`
  const think = profile.ollama.think
  if (think === undefined) return `${profile.id}: this profile has no think setting`
  if (think === false) return `${profile.id}: thinking is off in this profile, nothing to lower`
  if (think === true) {
    return h === 'off' ? null : `${profile.id}: think is on or off only; use --helper-think off`
  }
  return h === 'off'
    ? `${profile.id}: ${think} takes low, medium or high; Ollama ignores think off here`
    : null
}

/** Builds the AI client a profile runs on. `fetch` is injected in tests. */
export function createModelClient(
  profile: ModelProfile,
  o: {
    fetch?: typeof fetch
    onStats?: (s: OllamaCallStats) => void
    helperThink?: HelperThink
  } = {},
): AiClient {
  switch (profile.provider) {
    case 'ollama': {
      if (!profile.ollama) throw new Error(`${profile.id}: ollama settings are missing`)
      const helper = o.helperThink
      const thinkByTask =
        helper === undefined
          ? undefined
          : Object.fromEntries(HELPER_TASKS.map((task) => [task, helperThinkValue(helper)]))
      return new OllamaAiClient({
        ...profile.ollama,
        model: profile.model,
        fetch: o.fetch ?? ollamaTransport,
        onStats: o.onStats,
        ...(thinkByTask ? { thinkByTask } : {}),
      })
    }
    case 'opencode':
      return new OpencodeAiClient(undefined, profile.model)
    case 'fake':
      return new FakeAiClient()
  }
}
