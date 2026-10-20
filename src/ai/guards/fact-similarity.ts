import { stripJosa } from '@/lib/korean/josa'
import { koreanNumbersToDigits } from '@/lib/korean/numbers'
import { bigramDice, normalizeForCompare } from './similarity'

/** Bigram Dice at or above which two fact sentences count as the same fact. Calibrated on six saved runs in docs/eval/novel/2026-10-19-thresholds.md. */
export const FACT_DUPLICATE_DICE = 0.7

/**
 * True when two fact sentences are probably the same fact re-proposed. One pair per call.
 *
 * Known limits, each pinned by a test in fact-similarity.test.ts:
 * - Korean sentences must also agree on their content words: after Dice, the Hangul words (particles
 *   stripped) of one sentence must all occur in the other. One changed word (좋다/나쁘다,
 *   북쪽/남쪽) keeps the pair apart even when Dice is above 0.8. A separate negation or state
 *   word that only one side has also keeps them apart: a one-syllable word (안 믿는다, 못 쓴다,
 *   전 부단장) or one of 옛 더는 이제 아직 결코 절대. Other words that only one side adds, or a
 *   word with a short ending added (떨린다 / 떨린다고 한다), still count as a rewording.
 *   A negation glued to the next word (안믿는다) is not split; it is only caught when it changes
 *   the words enough to differ.
 * - English antonyms inside long sentences keep a high Dice (left-/right-handed and calm is
 *   about 0.83) and are reported as duplicates; the word check covers Hangul words only.
 * - Korean number words directly before a counter are read as digits first (koreanNumbersToDigits:
 *   열아홉 살 = 19살, 서른 닢 = 30닢, 구층 = 9층). Number words it does not read (no counter, a counter
 *   outside its list, 열명 without a space) and English number words stay unnormalized: `19` and
 *   `nineteen` score about 0.58, so they are not duplicates.
 * - A different number always means a different fact (digit rule); the digit rule sees the digits
 *   produced by the conversion.
 *
 * `minDice` exists for the threshold replay (eval/novel/thresholds.ts); product callers use the default.
 */
export function isNearDuplicateFact(
  rawA: string,
  rawB: string,
  minDice: number = FACT_DUPLICATE_DICE,
): boolean {
  // Read Korean number words as digits first, so 열아홉 살 and 19살 compare as one fact. The digit
  // rule, Dice and the content-word check below all see the converted strings.
  const a = koreanNumbersToDigits(rawA.normalize('NFC'))
  const b = koreanNumbersToDigits(rawB.normalize('NFC'))
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (na === '' || nb === '') return false
  if (na === nb) return true

  const digitsA = (a.match(/\d+/g) ?? []).sort()
  const digitsB = (b.match(/\d+/g) ?? []).sort()
  if (digitsA.join(' ') !== digitsB.join(' ')) return false

  if ([...na].length < 2 || [...nb].length < 2) return false
  if (bigramDice(a, b) < minDice) return false

  return contentWordsContained(a, b)
}

/** Hangul words of a sentence, one trailing particle pair stripped, as a set. */
function hangulWords(s: string): Set<string> {
  const words = new Set<string>()
  for (const raw of s.split(/\s+/)) {
    const word = normalizeForCompare(raw)
    if (!/\p{Script=Hangul}/u.test(word)) continue
    words.add(/^[가-힣]+$/.test(word) ? stripJosa(word) : word)
  }
  return words
}

/** Words that flip or restrict a fact; one on only one side means the facts differ. */
const POLARITY_WORDS = new Set(['안', '못', '전', '옛', '더는', '이제', '아직', '결코', '절대'])

/**
 * True when the smaller Hangul word set sits inside the larger one (spacing variants pass) and
 * the larger one has no extra negation or state word: a word only one side has that is one
 * syllable long or in POLARITY_WORDS (안 믿는다, 못 쓴다, 전 부단장).
 */
function contentWordsContained(a: string, b: string): boolean {
  const wa = hangulWords(a)
  const wb = hangulWords(b)
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa]
  const smallCovered = [...small].every(
    (word) => large.has(word) || [...large].some((w) => extendsWord(w, word)),
  )
  if (!smallCovered) return false
  return [...large].every(
    (word) =>
      small.has(word) ||
      [...small].some((w) => extendsWord(word, w)) ||
      !([...word].length === 1 || POLARITY_WORDS.has(word)),
  )
}

/** True when `long` is `short` plus a short ending (떨린다 -> 떨린다고), not a different word. */
function extendsWord(long: string, short: string): boolean {
  const extra = [...long].length - [...short].length
  return [...short].length >= 2 && extra > 0 && extra <= 2 && long.startsWith(short)
}
