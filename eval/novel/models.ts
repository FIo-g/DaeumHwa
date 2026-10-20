import { FakeAiClient } from '@/test/fake-ai'
import {
  OllamaAiClient,
  type OllamaAttempt,
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

/** USD per million tokens. Cached input is billed at the cache read and write rates. */
export type ModelPrice = {
  inputPerMTok: number
  outputPerMTok: number
  cacheReadPerMTok: number
  cacheWritePerMTok: number
  source: string
}

/** Cloud list prices, read on 2026-10-20. Local and fake profiles have no price. */
const CLOUD_PRICE: ModelPrice = {
  inputPerMTok: 0.1,
  outputPerMTok: 0.5,
  cacheReadPerMTok: 0.01,
  cacheWritePerMTok: 0.125,
  source: 'official pricing pages, 2026-10-20',
}

export type ModelProfile = {
  id: ModelId
  queue: 'local' | 'cloud' | 'test'
  provider: 'ollama' | 'opencode' | 'fake'
  model: string
  /** Effort the eval sends on every call. Under `--deploy-settings` each task's own effort is sent instead. */
  effort: AiEffort
  /** Output-token floor the eval applies to every call. Skipped under `--product-limits` and `--deploy-settings`. */
  maxTokensFloor: number
  timeoutMs: number
  ollama?: Omit<OllamaOptions, 'model' | 'fetch' | 'baseUrl'>
  /** e.g. 'mlx' | 'gguf' | 'api'; filled by Task 10. */
  variant: string
  /** List price for the chapter cost block. Absent on local and fake profiles. */
  price?: ModelPrice
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
    price: CLOUD_PRICE,
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
    price: CLOUD_PRICE,
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
  'draft-scene',
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

/**
 * Whether a run on this profile runs the two-step draft (beat list) and the scene rewrite. Local
 * profiles always do; other profiles only when the run was created with `--two-step on`.
 */
export function twoStepEnabled(profile: ModelProfile, twoStep?: boolean): boolean {
  return profile.queue === 'local' || twoStep === true
}

/** Why `--two-step on` cannot change anything on this profile, or null when it can. */
export function checkTwoStep(profile: ModelProfile): string | null {
  return profile.queue === 'local'
    ? `${profile.id}: local profiles already run the two-step draft`
    : null
}

/** Options for building a profile's client. `fetch` is injected in tests. */
export type ModelClientOptions = {
  fetch?: typeof fetch
  onStats?: (s: OllamaCallStats) => void
  onAttempt?: (a: OllamaAttempt) => void
  helperThink?: HelperThink
}

/**
 * The think one step lower, or null where there is none. Qwen's boolean `true` drops to `false`;
 * gpt-oss levels step down to `'low'` and stop there (it ignores `false`).
 */
export function lowerThink(think: OllamaThink | null | undefined): OllamaThink | null {
  if (think === true) return false
  if (think === 'high') return 'medium'
  if (think === 'medium') return 'low'
  return null
}

/**
 * The lower think a repeat of a helper call uses (P9), or null when the call keeps its think: a
 * prose task, a profile without Ollama settings, or a think that cannot go lower.
 */
export function retryThinkFor(
  profile: ModelProfile,
  task: AiTaskName,
  helper?: HelperThink,
): OllamaThink | null {
  if (!profile.ollama || PROSE_TASKS.includes(task)) return null
  return lowerThink(thinkFor(profile, task, helper))
}

/**
 * The client a repeat of a failed local call uses when its think is lowered (P9). Only tasks with
 * a lower think are listed; the rest fall back to the profile's think. Undefined when no task can
 * go lower, or the profile is not Ollama.
 */
export function createRetryClient(
  profile: ModelProfile,
  o: ModelClientOptions = {},
): AiClient | undefined {
  if (profile.provider !== 'ollama' || !profile.ollama) return undefined
  const thinkByTask: Partial<Record<AiTaskName, OllamaThink>> = {}
  for (const task of HELPER_TASKS) {
    const think = retryThinkFor(profile, task, o.helperThink)
    if (think !== null) thinkByTask[task] = think
  }
  if (Object.keys(thinkByTask).length === 0) return undefined
  return new OllamaAiClient({
    ...profile.ollama,
    model: profile.model,
    fetch: o.fetch ?? ollamaTransport,
    onStats: o.onStats,
    onAttempt: o.onAttempt,
    thinkByTask,
  })
}

/** Builds the AI client a profile runs on. `fetch` is injected in tests. */
export function createModelClient(profile: ModelProfile, o: ModelClientOptions = {}): AiClient {
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
        onAttempt: o.onAttempt,
        ...(thinkByTask ? { thinkByTask } : {}),
      })
    }
    case 'opencode':
      return new OpencodeAiClient(undefined, profile.model)
    case 'fake':
      return new FakeAiClient()
  }
}
