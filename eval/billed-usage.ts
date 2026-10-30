import { AppError } from '@/lib/errors'
import type { AiUsage } from '@/ai/types'

/**
 * Tokens a failed call was billed. The inner clients attach them to the AppError they throw, so a
 * call that failed after the server answered still counts in the run's totals.
 */
export function billedUsageOf(error: unknown): AiUsage | null {
  if (!(error instanceof AppError)) return null
  const usage = (error.details as { usage?: unknown } | undefined)?.usage
  if (typeof usage !== 'object' || usage === null) return null
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = usage as Partial<AiUsage>
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return null
  const billed: AiUsage = { inputTokens, outputTokens }
  if (typeof cacheReadTokens === 'number') billed.cacheReadTokens = cacheReadTokens
  if (typeof cacheWriteTokens === 'number') billed.cacheWriteTokens = cacheWriteTokens
  return billed
}
