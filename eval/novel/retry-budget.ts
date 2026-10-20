import { FORMAT_MESSAGE, MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import type { OllamaThink } from '@/ai/ollama'
import type { AiTaskName } from '@/db/types'
import { type HelperThink, type ModelProfile, retryThinkFor } from './models'

// Budget of a local eval call that is repeated after it failed (P9). Only the eval changes: the
// product sends its own caps and think. The step runner repeats a failed call once (withModelRetry);
// this file decides what the repeat may change.

/** Why the first call failed: its output hit the cap, or its answer did not parse. */
export type RetryReason = 'max-tokens' | 'format'

/** Set on the EvalClient when a model failure is taken for a repeat. */
export type RetryHint = { task: AiTaskName; reason: RetryReason; contextOverflow: boolean }

/** What the repeat changed. `maxTokens` and `think` are null where a lever was not changed. */
export type RetryBudget = {
  reason: RetryReason
  maxTokens: number | null
  think: OllamaThink | null
}

/** Which levers a reason may use. One table, so a lever is a one-word change. */
export const RETRY_POLICY: Record<RetryReason, { widen: boolean; lowerThink: boolean }> = {
  'max-tokens': { widen: true, lowerThink: true },
  format: { widen: false, lowerThink: true },
}

export const RETRY_MAX_TOKENS_FACTOR = 1.5

/** The reason a failed call's message names, or null for any other failure. Exact match only. */
export function retryReasonOf(message: string): RetryReason | null {
  if (message === MAX_TOKENS_MESSAGE) return 'max-tokens'
  if (message === FORMAT_MESSAGE) return 'format'
  return null
}

/**
 * The widened output cap, or null when it cannot grow. The ceiling is half of the context window,
 * so the prompt keeps room.
 */
export function widenedMaxTokens(base: number, numCtx: number | undefined): number | null {
  if (numCtx === undefined) return null
  const ceiling = Math.floor(numCtx / 2)
  const wider = Math.min(Math.ceil(base * RETRY_MAX_TOKENS_FACTOR), ceiling)
  return wider > base ? wider : null
}

/**
 * The budget for a repeat of a failed call, or null when the repeat keeps its budget. Local
 * profiles only; a product-limits run keeps the product caps and is never changed.
 */
export function planRetry(o: {
  hint: RetryHint
  profile: ModelProfile
  baseMaxTokens: number
  helperThink?: HelperThink
  hasRetryClient: boolean
  productLimits: boolean
}): RetryBudget | null {
  if (o.profile.queue !== 'local' || o.productLimits) return null
  const policy = RETRY_POLICY[o.hint.reason]
  const maxTokens =
    policy.widen && !o.hint.contextOverflow
      ? widenedMaxTokens(o.baseMaxTokens, o.profile.ollama?.numCtx)
      : null
  const think =
    policy.lowerThink && o.hasRetryClient
      ? retryThinkFor(o.profile, o.hint.task, o.helperThink)
      : null
  return maxTokens === null && think === null ? null : { reason: o.hint.reason, maxTokens, think }
}
