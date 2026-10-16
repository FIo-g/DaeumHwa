// Korean particles (조사) and syllable helpers. Hangul syllables are U+AC00..U+D7A3;
// the final consonant (받침) index is (code - 0xAC00) % 28, where 0 means none.

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3

const PARTICLE_LIST =
  '은 는 이 가 을 를 의 에 에게 에게서 에서 와 과 로 으로 도 만 께 께서 한테 한테서 랑 이랑 나 이나 야 아 여 이여 부터 까지 처럼 보다 조차 마저 라도 이라도 만큼 뿐 밖에 요 이요 이며 며 하고 들 이다 이었다 였다 이야 입니다 이에요 예요 이지 이고'

/** Particle tokens, longest first. */
export const JOSA: readonly string[] = [...new Set(PARTICLE_LIST.split(' '))].sort(
  (a, b) => b.length - a.length,
)

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
 * True when `run` can be split into at most `maxTokens` particles from JOSA.
 * A lone 이 is a subject particle only when `loneIAllowed` (the word before it ends in a 받침).
 */
export function canDecomposeJosa(run: string, maxTokens: number, loneIAllowed: boolean): boolean {
  if (run === '') return true
  if (maxTokens === 0) return false
  return JOSA.some((token) => {
    if (!run.startsWith(token)) return false
    if (token === '이' && !loneIAllowed) return false
    return canDecomposeJosa(run.slice(token.length), maxTokens - 1, false)
  })
}

/**
 * Strips up to two trailing particles, longest match first, keeping at least two characters.
 * A lone 이 is stripped only after a syllable with a 받침 (서윤이 -> 서윤, 수이 stays).
 */
export function stripJosa(word: string): string {
  let s = word
  for (let n = 0; n < 2; n++) {
    const token = JOSA.find((t) => {
      if (!s.endsWith(t) || s.length - t.length < 2) return false
      if (t !== '이') return true
      return hasJongseong(s.charAt(s.length - t.length - 1))
    })
    if (token === undefined) break
    s = s.slice(0, s.length - token.length)
  }
  return s
}
