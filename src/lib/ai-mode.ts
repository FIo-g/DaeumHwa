/**
 * Which AI backend serves requests. AI_PROVIDER wins when it names a provider whose key is set.
 * Otherwise the provider follows the keys: Anthropic first, then OpenCode Go. Null when no key is set.
 */
export type AiProvider = 'anthropic' | 'opencode'

export const AI_KEY_MISSING_MESSAGE = 'AI 키가 설정되지 않아 AI 기능을 쓸 수 없습니다.'

const KNOWN_PROVIDERS: readonly AiProvider[] = ['anthropic', 'opencode']
const KEY_NAME: Record<AiProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  opencode: 'OPENCODE_API_KEY',
}

let warnedIgnoredProvider = false

export function getAiProvider(): AiProvider | null {
  const requested = process.env.AI_PROVIDER?.trim() ?? ''
  if (isKnownProvider(requested) && hasKey(KEY_NAME[requested])) return requested
  if (requested !== '' && !warnedIgnoredProvider) {
    warnedIgnoredProvider = true
    console.warn(
      `AI_PROVIDER 값 "${requested}"을(를) 쓸 수 없어 키 유무로 정합니다. (anthropic은 ANTHROPIC_API_KEY, opencode는 OPENCODE_API_KEY가 있어야 합니다)`,
    )
  }
  if (hasKey('ANTHROPIC_API_KEY')) return 'anthropic'
  if (hasKey('OPENCODE_API_KEY')) return 'opencode'
  return null
}

/** True when an AI key is set, so AI features can run. */
export function isAiConfigured(): boolean {
  return getAiProvider() !== null
}

function isKnownProvider(value: string): value is AiProvider {
  return (KNOWN_PROVIDERS as readonly string[]).includes(value)
}

function hasKey(name: string): boolean {
  return (process.env[name] ?? '').trim() !== ''
}
