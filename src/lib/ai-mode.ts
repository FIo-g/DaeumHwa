/**
 * Which AI backend serves requests. AI_PROVIDER wins when it is a known value. Otherwise the
 * provider follows the keys: Anthropic first, then OpenCode Go, then the fake (demo) client.
 */
export type AiProvider = 'anthropic' | 'opencode' | 'fake'

const KNOWN_PROVIDERS: readonly AiProvider[] = ['anthropic', 'opencode', 'fake']

let warnedUnknownProvider = false

export function getAiProvider(): AiProvider {
  const requested = process.env.AI_PROVIDER?.trim() ?? ''
  if (isKnownProvider(requested)) return requested
  if (requested !== '' && !warnedUnknownProvider) {
    warnedUnknownProvider = true
    console.warn(
      `AI_PROVIDER 값 "${requested}"은(는) 알 수 없어 키 유무로 정합니다. (anthropic, opencode, fake 중 하나)`,
    )
  }
  if (hasKey('ANTHROPIC_API_KEY')) return 'anthropic'
  if (hasKey('OPENCODE_API_KEY')) return 'opencode'
  return 'fake'
}

/** Demo mode serves deterministic fake AI output. */
export function isDemoMode(): boolean {
  return getAiProvider() === 'fake'
}

function isKnownProvider(value: string): value is AiProvider {
  return (KNOWN_PROVIDERS as readonly string[]).includes(value)
}

function hasKey(name: string): boolean {
  return (process.env[name] ?? '').trim() !== ''
}
