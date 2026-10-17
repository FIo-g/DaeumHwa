// Korean particles (조사) and syllable helpers. Hangul syllables are U+AC00..U+D7A3;
// the final consonant (받침) index is (code - 0xAC00) % 28, where 0 means none.

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3

const PARTICLE_LIST =
  '은 는 이 가 을 를 의 에 에게 에게서 에서 와 과 로 으로 도 만 께 께서 한테 한테서 랑 이랑 나 이나 야 아 여 이여 부터 까지 처럼 보다 조차 마저 라도 이라도 만큼 뿐 밖에 요 이요 이며 며 하고 들 이다 이었다 였다 이야 입니다 이에요 예요 이지 이고'

/** Particle tokens, longest first. */
export const JOSA: readonly string[] = longestFirst(PARTICLE_LIST.split(' '))

// Copula and quotative endings that may follow a name in running text (서윤이라는, 지후인데).
// Kept out of JOSA: stripJosa and name matching must not strip these from real names.
const MENTION_ENDING_LIST =
  '라는 라고 라면 란 이라는 이라고 이라면 이란 이면 이든 이자 이던 이었던 이니까 인데 인지 인가 니까 에겐 한텐 으로서 으로써 으로부터 에게로 이야말로 야말로 만이'

/** Tokens a mention may be followed by: JOSA plus MENTION_ENDING_LIST, longest first. */
export const MENTION_TOKENS: readonly string[] = longestFirst([
  ...JOSA,
  ...MENTION_ENDING_LIST.split(' '),
])

function longestFirst(tokens: string[]): string[] {
  return [...new Set(tokens)].sort((a, b) => b.length - a.length)
}

/** Final-consonant index of a Hangul syllable, or -1 when `ch` is not one. */
export function jongseongIndex(ch: string): number {
  const code = ch.codePointAt(0) ?? -1
  if (code < HANGUL_START || code > HANGUL_END) return -1
  return (code - HANGUL_START) % 28
}

export function hasJongseong(ch: string): boolean {
  return jongseongIndex(ch) > 0
}

/**
 * True when `run` can be split into at most `maxTokens` tokens from `tokens` (JOSA by default).
 * A lone 이 is a subject particle only when `loneIAllowed` (the word before it ends in a 받침).
 */
export function canDecomposeJosa(
  run: string,
  maxTokens: number,
  loneIAllowed: boolean,
  tokens: readonly string[] = JOSA,
): boolean {
  if (run === '') return true
  if (maxTokens === 0) return false
  return tokens.some((token) => {
    if (!run.startsWith(token)) return false
    if (token === '이' && !loneIAllowed) return false
    return canDecomposeJosa(run.slice(token.length), maxTokens - 1, false, tokens)
  })
}

/** Removes one trailing particle (longest match), keeping at least two characters. */
function stripOneJosa(s: string): string {
  const token = JOSA.find((t) => {
    if (!s.endsWith(t) || s.length - t.length < 2) return false
    if (t !== '이') return true
    return hasJongseong(s.charAt(s.length - t.length - 1))
  })
  return token === undefined ? s : s.slice(0, s.length - token.length)
}

/**
 * Strips up to two trailing particles, longest match first, keeping at least two characters.
 * A lone 이 is stripped only after a syllable with a 받침 (서윤이 -> 서윤, 수이 stays).
 */
export function stripJosa(word: string): string {
  let s = word
  for (let n = 0; n < 2; n++) s = stripOneJosa(s)
  return s
}

/**
 * The trimmed word, then the word with one and two trailing particles removed (where present).
 * Use these only to look a candidate up in existing names; never use a stripped form as the
 * identity of a name, because two different names can strip to the same form (김서아, 김서은).
 */
export function josaStrippedForms(word: string): string[] {
  const forms = [word.trim()]
  for (let n = 0; n < 2; n++) {
    const current = forms[forms.length - 1]
    const next = stripOneJosa(current)
    if (next === current) break
    forms.push(next)
  }
  return forms
}

/**
 * True when `candidate` is `name` itself or `name` followed by particles (서윤이 -> 서윤).
 * Names are compared as raw strings after the candidate's particles are removed.
 */
export function matchesName(candidate: string, name: string): boolean {
  const target = name.trim()
  if (target === '' || candidate.trim() === '') return false
  return josaStrippedForms(candidate).includes(target)
}

/**
 * Finds the item whose names (`namesOf`) match `candidate`. An exact match wins over one
 * reached only by removing particles, so the item named exactly as the text wins.
 */
export function findNameMatch<T>(
  candidate: string,
  items: readonly T[],
  namesOf: (item: T) => readonly string[],
): T | undefined {
  if (candidate.trim() === '') return undefined
  for (const form of josaStrippedForms(candidate)) {
    const hit = items.find((item) => namesOf(item).some((name) => name.trim() === form))
    if (hit !== undefined) return hit
  }
  return undefined
}
