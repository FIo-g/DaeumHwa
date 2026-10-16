import { isDemoMode } from '@/lib/ai-mode'
import { AnthropicAiClient } from '@/ai/anthropic'
import { FakeAiClient } from '@/ai/fake'
import type { AiClient } from '@/ai/types'

const DEFAULT_MODEL = 'claude-opus-5-5'

let cached: AiClient | null = null
let override: AiClient | null = null

/** The AI client for this process: the fake client in demo mode, otherwise the Anthropic client. */
export function getAiClient(): AiClient {
  if (override) return override
  if (!cached) cached = isDemoMode() ? new FakeAiClient() : new AnthropicAiClient()
  return cached
}

/** Replaces the client (tests). Pass null to go back to the environment-based client. */
export function setAiClientForTests(client: AiClient | null): void {
  override = client
  cached = null
}

/** Default model for interactive tasks. Never defaults to a cheaper model. */
export function getDefaultModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL
}

/** Model for manuscript import extraction; falls back to the default model. */
export function getImportModel(): string {
  return process.env.ANTHROPIC_MODEL_IMPORT?.trim() || getDefaultModel()
}
