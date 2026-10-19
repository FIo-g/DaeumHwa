import { stripJosa } from '@/lib/korean/josa'
import type { Lang, RepeatedWord } from './types'

// Function words that repeat in any English chapter. Dropped before counting single words only;
// bigrams are formed before this list is applied, so a stop word can sit inside a bigram.
const EN_STOPWORDS = new Set(
  (
    'the and that with was were had has have her his she they them this there from for not but ' +
    'you your said what when then into been'
  ).split(' '),
)

const HANGUL_ONLY = /^[가-힣]+$/

type Token = { word: string; start: number }

/**
 * Words (or adjacent word pairs with `ngram: 2`) that occur at least `minCount` times, sorted by
 * count desc then word asc. Korean tokens lose trailing particles (오른손으로 -> 오른손).
 * `per1000` divides by the code point count of `text`; `positions` are UTF-16 offsets.
 * Defaults are placeholders, not calibrated (spec section 8, 9).
 */
export function repeatedWords(
  text: string,
  opts?: { lang?: Lang; minCount?: number; minLength?: number; ngram?: 1 | 2; allow?: string[] },
): RepeatedWord[] {
  const lang = opts?.lang ?? 'ko'
  const minCount = opts?.minCount ?? 8
  const minLength = opts?.minLength ?? (lang === 'ko' ? 2 : 4)
  const ngram = opts?.ngram ?? 1
  const allowed = new Set((opts?.allow ?? []).map((word) => word.toLowerCase()))

  // Step 1: the full token list, before any filter, so bigram pairs keep their neighbours.
  const tokens: Token[] = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => {
    let word = match[0].toLowerCase()
    if (HANGUL_ONLY.test(word)) word = stripJosa(word)
    return { word, start: match.index ?? 0 }
  })

  const units: Token[] =
    ngram === 1
      ? tokens.filter(
          (token) =>
            [...token.word].length >= minLength &&
            !allowed.has(token.word) &&
            !(lang === 'en' && EN_STOPWORDS.has(token.word)),
        )
      : tokens.slice(0, -1).flatMap((token, index) => {
          const next = tokens[index + 1]
          const word = `${token.word} ${next.word}`
          return allowed.has(word) ? [] : [{ word, start: token.start }]
        })

  const groups = new Map<string, number[]>()
  for (const unit of units) {
    const positions = groups.get(unit.word) ?? []
    positions.push(unit.start)
    groups.set(unit.word, positions)
  }

  const codePoints = [...text].length
  return [...groups]
    .filter(([, positions]) => positions.length >= minCount)
    .map(([word, positions]) => ({
      word,
      count: positions.length,
      per1000: codePoints === 0 ? 0 : Math.round((positions.length * 1000 * 100) / codePoints) / 100,
      positions,
    }))
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
}
