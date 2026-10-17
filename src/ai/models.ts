import type { AiProvider } from '@/lib/ai-mode'

/** Default model for every provider, unless the provider's model env var says otherwise. */
export const DEFAULT_MODEL = 'claude-haiku-5-5'

function envModel(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

/** Default model for interactive tasks. Reads OPENCODE_MODEL for OpenCode Go, else ANTHROPIC_MODEL. */
export function providerDefaultModel(provider: AiProvider): string {
  const name = provider === 'opencode' ? 'OPENCODE_MODEL' : 'ANTHROPIC_MODEL'
  return envModel(name) ?? DEFAULT_MODEL
}

/** Model for manuscript import extraction; falls back to the provider's default model. */
export function providerImportModel(provider: AiProvider): string {
  const name = provider === 'opencode' ? 'OPENCODE_MODEL_IMPORT' : 'ANTHROPIC_MODEL_IMPORT'
  return envModel(name) ?? providerDefaultModel(provider)
}

/**
 * True for OpenCode Go "Contributor" models. Their provider may use prompts and completions for
 * model training (not zero data retention), so the app warns before sending manuscript text.
 */
export function isTrainingDataModel(model: string): boolean {
  return model.toLowerCase().includes('contributor')
}
