import type { OllamaAttempt } from '@/ai/ollama'

/**
 * Highest prompt rate (tokens per second) that is taken as real. Genuine local rates in the saved
 * runs top out near 1,600; suspicious ones start near 8,200. Strictly above this is suspect.
 */
export const PROMPT_RATE_CEILING = 5000

/** Ollama's record of one call: its attempts, time outside Ollama's timer, and the cache flag. */
export type CallOllama = {
  attempts: OllamaAttempt[]
  unaccountedMs: number | null
  promptCacheSuspected: boolean
}

/**
 * True when a prompt rate cannot be trusted: no prompt tokens or no prompt time, or a rate above
 * PROMPT_RATE_CEILING. A cached prompt is reported as a near-zero prompt time, so the rate looks
 * far too high.
 */
export function promptRateSuspect(promptTokens: number, promptMs: number): boolean {
  if (promptTokens <= 0 || promptMs <= 0) return true
  return promptTokens / (promptMs / 1000) > PROMPT_RATE_CEILING
}

/**
 * Wall time of a call minus Ollama's total time over its attempts. Null when there are no attempts
 * or one of them did not finish or has no total. Not clamped: a negative value means Ollama's
 * clock read more than ours.
 */
export function unaccountedMs(
  durationMs: number,
  attempts: readonly Pick<OllamaAttempt, 'done' | 'totalMs'>[],
): number | null {
  if (attempts.length === 0) return null
  let ollamaMs = 0
  for (const attempt of attempts) {
    if (!attempt.done || attempt.totalMs === null) return null
    ollamaMs += attempt.totalMs
  }
  return durationMs - ollamaMs
}

/** The Ollama record of a call, or undefined when no attempt was reported. */
export function callOllama(args: {
  durationMs: number
  attempts: OllamaAttempt[]
  promptCacheSuspected: boolean
}): CallOllama | undefined {
  if (args.attempts.length === 0) return undefined
  return {
    attempts: args.attempts,
    unaccountedMs: unaccountedMs(args.durationMs, args.attempts),
    promptCacheSuspected: args.promptCacheSuspected,
  }
}
