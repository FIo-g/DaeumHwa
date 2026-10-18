/**
 * Which AI backend serves requests. AI_PROVIDER wins when it is a known value. Otherwise the
 * provider follows the keys: Anthropic first, then OpenCode Go. Null when no key is set.
 */
export type AiProvider = 'anthropic' | 'opencode'

export const AI_KEY_MISSING_MESSAGE = 'AI 키가 설정되지 않아 AI 기능을 쓸 수 없습니다.'

const KNOWN_PROVIDERS: readonly AiProvider[] = ['anthropic', 'opencode']

let warnedUnknownProvider = false

export function getAiProvider(): AiProvider | null {
  const requested = process.env.AI_PROVIDER?.trim() ?? ''
  if (isKnownProvider(requested)) return requested
  if (requested !== '' && !warnedUnknownProvider) {
    warnedUnknownProvider = true
    console.warn(
      `AI_PROVIDER 값 "${requested}"은(는) 알 수 없어 키 유무로 정합니다. (anthropic, opencode 중 하나)`,
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
