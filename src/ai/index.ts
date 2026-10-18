import { AI_KEY_MISSING_MESSAGE, getAiProvider } from '@/lib/ai-mode'
import { AppError } from '@/lib/errors'
import { AnthropicAiClient } from '@/ai/anthropic'
import { OpencodeAiClient } from '@/ai/opencode'
import { providerDefaultModel, providerImportModel } from '@/ai/models'
import type { AiClient } from '@/ai/types'

let cached: AiClient | null = null
let override: AiClient | null = null

/** The AI client for this process. Throws AI_ERROR when no AI key is configured. */
export function getAiClient(): AiClient {
  if (override) return override
  if (!cached) {
    const provider = getAiProvider()
    if (provider === null) throw new AppError('AI_ERROR', AI_KEY_MISSING_MESSAGE)
    cached = provider === 'opencode' ? new OpencodeAiClient() : new AnthropicAiClient()
  }
  return cached
}

/** Replaces the client (tests). Pass null to go back to the environment-based client. */
export function setAiClientForTests(client: AiClient | null): void {
  override = client
  cached = null
}

/** Default model for interactive tasks (claude-haiku-5-5 unless the provider's model env var is set). */
export function getDefaultModel(): string {
  return providerDefaultModel(getAiProvider())
}

/** Model for manuscript import extraction; falls back to the default model. */
export function getImportModel(): string {
  return providerImportModel(getAiProvider())
}
