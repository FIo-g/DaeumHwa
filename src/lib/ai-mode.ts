/**
 * Demo mode serves deterministic fake AI output. AI_PROVIDER wins when set;
 * otherwise demo mode is on when no Anthropic API key is configured.
 */
export function isDemoMode(): boolean {
  const provider = process.env.AI_PROVIDER
  if (provider === 'fake') return true
  if (provider === 'anthropic') return false
  return !process.env.ANTHROPIC_API_KEY
}
